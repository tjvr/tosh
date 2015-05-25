
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

/*
editor.setOption("extraKeys", {
  Tab: function(cm) {
    var spaces = Array(cm.getOption("indentUnit") + 1).join(" ");
    cm.replaceSelection(spaces);
  }
});
*/

function measureTokens(tokens) {
  var length = 0;
  for (var i=0; i<tokens.length; i++) {
    length += tokens[i].text.length;
  }
  return length;
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
        var cursor = cm.getCursor();
        var line = cm.doc.getLine(cursor.line);
        var indent = /^\t*/.exec(line)[0].length;
        var prefix = line.slice(indent, cursor.ch);
        var suffix = line.slice(cursor.ch);
        if (!prefix) return;

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

        var state = cm.getStateAfter(cursor.line);
        var g = state.grammar;
        var parser = new Earley.Parser(g);

        var tokens = Language.tokenize(line);
        try {
          parser.parse(tokens); return;
        } catch (e) { console.log(e); }

        var completer = new Earley.Completer(g);

        var beforeTokens = Language.tokenize(prefix);
        var completingToken;
        if (!/ $/.test(prefix)) {
          token = beforeTokens[beforeTokens.length - 1];
          if (token.kind === "symbol") {
            completingToken = token;
            token.isPartial = true;
          }
        }
        var afterTokens = Language.tokenize(suffix);
        var tokens = beforeTokens.concat(afterTokens);
        var completions = completer.complete(tokens, beforeTokens.length);

        if (!completions) {
          return; // There was an error!
        }

        var from = measureTokens(beforeTokens);
        if (completingToken) {
          var index = beforeTokens.length - 1;
          from = measureTokens(beforeTokens.slice(0, index));
        }
        from++;

        var list = [];
        completions.forEach(function(c) {
            var symbols = c.completion;
            if (c.pre.length === 1 && typeof c.pre[0] === "string") return;
            if (c.pre[0] === "block") return;

            var startToken = c.start + c.pre.length;
            if (completingToken) {
              var spec = c.pre[c.pre.length - 1]
              if (spec.kind === "symbol" || spec === "@greenFlag") {
                  // completingToken.value !== spec.value) {
                symbols.splice(0, 0, spec);
                startToken--;
              }
            }
            var startIndex = measureTokens(tokens.slice(0, startToken));

            if (!symbols.length) return;

            var endToken = c.end - c.post.length;
            var endIndex = measureTokens(tokens.slice(0, endToken));

            // TODO:
            // - fix from/end
            //    need a way to measure the size of productions like `n`...
            //    or just set
            // - add space at end when suffix is non-empty
            // - when completing a block or reporter, select first input
            // - allow tab key to move between inputs?
            // - don't suggest completed things!
            //    - but do complete the space after them.
            // - don't suggest "then" multiple times :p
            // - can we reverse the item order when the complete box is *above*
            //   the current line?
            // - can we autocomplete broadcasts, sprite names, etc? :D
            // - *please* can autocomplete work properly for
            //   "sin of" etc...
            //  - "mouse down ?" is spaced wrong

            // return vs. tab?

            // show completion if:
            // - the line parses
            // - there's no space at the end

            // <> and _  should trigger completion simply by cursor/select them

            // nb. list reporters are highlighted wrong colour

            // TODO we need an auto-indenter!

            assert(startIndex <= endIndex);
            assert(endIndex <= line.length);
            if (!completingToken) {
              if (startIndex === endIndex) endIndex++;
              startIndex++;
            }

            var parts = [];
            for (var i=0; i<symbols.length; i++) {
              var part = symbols[i];
              if (typeof part === "string") {
                var name = symbols[i];
                if (name[0] === "@") {
                  part = g.rulesByName[name][0].symbols[0].value;
                } else {
                  if (/^b[0-9]?$/.test(name)) {
                    part = "<>";
                  } else {
                    part = "_";
                  }
                }
              } else {
                part = part.value;
              }
              parts.push(part);
            }

            list.push({
              from: { line: cursor.line, ch: indent + startIndex },
              to:   { line: cursor.line, ch: indent + endIndex },
              text: parts.join(" "),
            })
        });

        console.log(list);

        if (!list) return;

        return {
          list: list,
          from: {line: cursor.line, ch: indent + from},
          to:   {line: cursor.line, ch: cursor.ch},
        };
      },
      completeSingle: false,
      alignWithWord: true,
      customKeys: {
        Up:       function(_, menu) { menu.moveFocus(-1); },
        Down:     function(_, menu) { menu.moveFocus(1); },
        Home:     function(_, menu) { menu.setFocus(0);},
        End:      function(_, menu) { menu.setFocus(menu.length - 1); },
        Enter:    function(_, menu) { menu.pick() },
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

