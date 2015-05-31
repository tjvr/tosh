
var editor = document.getElementById('editor');

var cm = CodeMirror(editor, {
  value: window.localStorage['editor-content'] || "",
  mode: "tosh",

  indentUnit: 4,
  tabSize: 4,
  indentWithTabs: true,

  lineNumbers: true,

  autofocus: true,

  cursorHeight: 1,
});

function sb(text) {
  var script = scratchblocks2.parse_scripts(text)[0];
  var s = scratchblocks2.render_stack(script)[0];
  s.classList.add('script');
  return el('.sb2.inline-block', s);
}

cm.on("keyup", function(cm, e) {
  if (e.keyCode === 32 && e.ctrlKey) {
    showHint();
    e.preventDefault();
  }
});

function inputSeek(dir) {
  var l = tokenizeAtCursor({ splitSelection: false });
  if (!l) return;

  var index = l.cursor + dir;
  if (dir > 0 && l.tokens[l.cursor] && l.tokens[l.cursor].text === '-') index += 1;
  for (var i = index;
       dir > 0 ? i < l.tokens.length : i >= 0;
       i += dir
  ) {
    var token = l.tokens[i];
    if (token.kind !== 'symbol') {
      var start = l.start.ch + measureTokens(l.tokens.slice(0, i));
      end = start + token.text.replace(/ *$/, "").length;
      var line = l.from.line;
      if (token.kind === 'number' && l.tokens[i - 1].text === '-') start--;
      if (token.kind === 'string') { start++; end--; }
      cm.setSelection({ line: line, ch: start }, { line: line, ch: end });
      return;
    }
  }

  cm.setCursor(dir > 0 ? l.end : l.start);
}

cm.setOption("extraKeys", {
  'Tab': function(cm) {
    inputSeek(+1);
  },
  'Shift-Tab': function(cm) {
    inputSeek(-1);
  },
});

function indentify(text) {
  text = text || '';
  var indentation = '';
  for (var i=0; i<indent; i++) indentation += '\t';
  var lines = text.split('\n');
  for (var j=1; j<lines.length; j++) {
    lines[j] = indentation + lines[j];
  }
  return lines.join('\n');
}

function measureTokens(tokens) {
  var length = 0;
  for (var i=0; i<tokens.length; i++) {
    length += tokens[i].text.length;
  }
  return length;
}

function tokenizeAtCursor(options) {
  var selection = cm.getSelection();
  var cursor = cm.getCursor('from');
  var text = cm.doc.getLine(cursor.line);

  var indent = /^\t*/.exec(text)[0].length;
  var prefix = text.slice(indent, cursor.ch);
  var suffix = text.slice(cursor.ch);

  var isPartial = !/ $/.test(prefix);

  var tokens,
      cursorIndex;
  if (options.splitSelection) {
    var beforeTokens = Language.tokenize(prefix);
    var afterTokens = Language.tokenize(suffix);
    tokens = beforeTokens.concat(afterTokens);
    cursorIndex = beforeTokens.length;

    if (isPartial && prefix) {
      token = tokens[cursorIndex - 1];
      if (token.kind === "symbol") {
        token.isPartial = true;
      }
    }
  } else {
    var tokens = Language.tokenize(prefix + suffix);
    var size = indent;
    for (var i=0; i<tokens.length; i++) {
      size += tokens[i].text.length;
      if (size > cursor.ch) {
        break;
      }
    }
    cursorIndex = i;
  }

  var to = measureTokens(tokens.slice(0, cursorIndex));
  var from;
  if (isPartial) {
    from = measureTokens(tokens.slice(0, cursorIndex - 1));
  } else {
    from = to;
  }

  return {
    from:  { line: cursor.line, ch: indent + from },
    to:    { line: cursor.line, ch: indent + to   },
    end:   { line: cursor.line, ch: text.length   },
    start: { line: cursor.line, ch: indent        },

    selection: selection,

    state: cm.getStateAfter(cursor.line),
    cursor: cursorIndex,
    tokens: tokens,
    isPartial: isPartial,
  }
}

function showHint() {
    console.log('showHint()');

    function r(dom) {
      return function(container) {
        if (typeof dom === 'string') dom = document.createTextNode(dom);
        container.appendChild(dom);
      };
    }

    // TODO tab key:
    // - with selection: indent
    // - at beginning of line: indent
    // - otherwise: show hint

    cm.showHint({
      hint: function(cm, options) {
        var l = tokenizeAtCursor({ splitSelection: true });
        if (!l) return;
        if (l.cursor === 0) return;
        if (!(l.selection === "" || l.selection === "_" || l.selection === "<>")) return;

        var g = l.state.grammar;
        var parser = new Earley.Parser(g);

        if (l.isPartial && l.cursor === l.tokens.length) {
          l.tokens[l.cursor - 1].isPartial = false;
          try {
            parser.parse(l.tokens); return;
          } catch (e) { console.log(e); }
          l.tokens[l.cursor - 1].isPartial = true;
        }

        var completer = new Earley.Completer(g);
        var completions = completer.complete(l.tokens, l.cursor);
        if (!completions) {
          return; // There was an error!
        }

        var list = [];
        completions.forEach(function(c) {
            var symbols = c.completion;
            if (c.pre.length === 1 && typeof c.pre[0] === "string") return;
            if (c.pre[0] === "block") return;

            if (l.isPartial) {
              var spec = c.pre[c.pre.length - 1];
              symbols.splice(0, 0, spec);
            }

            if (!symbols.length) return;

            // TODO:
            // - add space at end when suffix is non-empty
            // - don't suggest completed things!
            //    - but do complete the space after them.
            // - can we reverse the item order when the complete box is *above*
            //   the current line?
            // - can we autocomplete broadcasts, sprite names, etc? :D
            // - *please* can autocomplete work properly for
            //   "sin of" etc...
            //  - "mouse down ?" is spaced wrong

            // <> and _  should trigger completion simply by cursor/select them

            // nb. list reporters are highlighted wrong colour

            // TODO we need an auto-indenter!

            var selection;
            var text = "";
            var displayText = "";
            for (var i=0; i<symbols.length; i++) {
              if (i > 0) {
                displayText += " ";
                text += " ";
              }
              var part = symbols[i];
              var displayPart = undefined;
              if (typeof part === "string") {
                var name = symbols[i];
                if (name[0] === "@") {
                  part = g.rulesByName[name][0].symbols[0].value;
                } else {
                  if (/^b[0-9]?$/.test(name)) {
                    if (!selection) selection = { ch: text.length, size: 2 };
                    part = "<>";
                  } else {
                    if (!selection) selection = { ch: text.length, size: 1 };
                    part = "_";
                  }

                  if (l.isPartial && i === 0) {
                    // Sometimes we need more than one token!
                    // Not sure what to do about this…

                    var token = l.tokens[l.cursor - 1];
                    displayPart = part;
                    part = token.text;
                    selection = { ch: part.length };
                  }
                }
              } else if (part.kind === "symbol") {
                part = part.value;
              } else {
                // if (l.isPartial && symbols.length === 1) {
                //   part = l.tokens[l.cursor - 1].text;
                // } else {
                  // The completion contains a non-symbol token.
                  // We don't care about these
                  return;
                // }
              }
              text += part;
              displayText += (displayPart === undefined ? part : displayPart);
            }

            if (displayText === "<>" || displayText === "_") return;

            console.log(text);

            assert(text);

            var completion = {
              displayText: displayText,
              text: text,
              hint: applyHint,
              selection: selection,
            };

            if (c.rule.process.name === 'unaryMinus') return;

            if (l.isPartial) {
              completion.text += " ";

              if (text === "_") {
                completion.selection = undefined;
              }

              if (!completion.selection) {
                completion.seekInput = true;
              }

              var nextToken = l.tokens[l.cursor];
              if (nextToken && /^ /.test(nextToken.text)) {
                completion.to = { line: l.to.line, ch: l.to.ch + 1 };
              }
            }

            list.push(completion);
        });

        function applyHint(cm, data, completion) {
          var text = completion.text;
          cm.replaceRange(text, completion.from || data.from,
                                completion.to || data.to, "complete");
          if (completion.selection) {
            var line = result.from.line;
            var start = result.from.ch + completion.selection.ch;
            var end = start + (completion.selection.size || 0);
            cm.setSelection({ line: line, ch: start }, { line: line, ch: end });
          }
          if (completion.seekInput) {
            inputSeek(+1);
          }
        }

        if (!list) return;

        var result = {
          list: list,
          from: l.from,
          to:   l.to,
        };
        return result;
      },
      completeSingle: false,
      alignWithWord: true,
      customKeys: {
        Up:       function(_, menu) { menu.moveFocus(-1); },
        Down:     function(_, menu) { menu.moveFocus(1); },
        Home:     function(_, menu) { menu.setFocus(0);},
        End:      function(_, menu) { menu.setFocus(menu.length - 1); },
        // Enter:    function(_, menu) { menu.pick() },
        Tab:      function(_, menu) { menu.pick(); },
        Esc:      function(_, menu) { menu.close() },
      },
    });
};

cm.on('change', function(cm) {
  window.localStorage['editor-content'] = cm.getValue();
  showHint();
});

var onResize = function() {
  cm.setSize(editor.clientWidth, editor.clientHeight)
};
window.addEventListener('resize', onResize);
onResize();

