
var isMac = /Mac/i.test(navigator.userAgent);
var Pos = CodeMirror.Pos;

var editor = document.getElementById('editor');

var cm = CodeMirror(editor, {
  value: "",
  mode: "tosh",

  indentUnit: 3,
  smartIndent: true,
  tabSize: 3,
  indentWithTabs: true,

  lineWrapping: true,
  dragDrop: false,
  cursorScrollMargin: 80,

  lineNumbers: true,
  gutters: ["CodeMirror-linenumbers", "errors"],

  autofocus: true,

  cursorHeight: 1,

  scratchVariables: [],
  scratchLists: [],
  scratchDefinitions: [],
});

var windowSize = ko();
var onResize = function() {
  windowSize.assign({
    width: window.innerWidth,
    height: window.innerHeight,
  });
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
onResize();

function fixEditorLayout() {
  cm.setSize(editor.clientWidth, editor.clientHeight)
}
windowSize.subscribe(fixEditorLayout);

/*****************************************************************************/

/* editor */

var extraKeys = {
  'Shift-Ctrl-K': function(cm) {
    toggleVim();
  },
  'Ctrl-Space': function(cm) {
    if (cm.somethingSelected()) {
      cm.replaceSelection(''); // TODO complete on a selection
    }
    requestHint();
  },
  'Tab': function(cm) {
    // TODO if there's no error with the input, just do an inputSeek.
    // TODO tab at beginning of line
    // TODO I think indentation breaks completion

    if (!cm.somethingSelected()) {
      var results = computeHint();
      // TODO: cache hints, so this doesn't suck
      if (results && results.list && results.list.length) {
        requestHint();
        return;
      }
    }
    if (inputSeek(+1)) return;

    // indent
    if (cm.somethingSelected()) {
      cm.indentSelection('add');
    } else {
      cm.replaceSelection("\t", 'end', '+input');
    }
  },
  'Shift-Tab': function(cm) {
    if (inputSeek(-1)) return;

    // dedent
    cm.indentSelection('subtract');
  },
};

/* Sublime-style bindings */

var swapLineCombo = isMac ? 'Cmd-Ctrl-' : 'Shift-Ctrl-';

extraKeys[swapLineCombo + 'Up'] = function(cm) {
  var ranges = cm.listSelections(), linesToMove = [], at = cm.firstLine() - 1, newSels = [];
  for (var i = 0; i < ranges.length; i++) {
    var range = ranges[i], from = range.from().line - 1, to = range.to().line;
    newSels.push({anchor: Pos(range.anchor.line - 1, range.anchor.ch),
                  head: Pos(range.head.line - 1, range.head.ch)});
    if (range.to().ch == 0 && !range.empty()) --to;
    if (from > at) linesToMove.push(from, to);
    else if (linesToMove.length) linesToMove[linesToMove.length - 1] = to;
    at = to;
  }
  cm.operation(function() {
    for (var i = 0; i < linesToMove.length; i += 2) {
      var from = linesToMove[i], to = linesToMove[i + 1];
      var line = cm.getLine(from);
      cm.replaceRange("", Pos(from, 0), Pos(from + 1, 0), "+swapLine");
      if (to > cm.lastLine())
        cm.replaceRange("\n" + line, Pos(cm.lastLine()), null, "+swapLine");
      else
        cm.replaceRange(line + "\n", Pos(to, 0), null, "+swapLine");
    }
    cm.setSelections(newSels);
    cm.scrollIntoView();
  });
},

extraKeys[swapLineCombo + 'Down'] = function(cm) {
  var ranges = cm.listSelections(), linesToMove = [], at = cm.lastLine() + 1;
  for (var i = ranges.length - 1; i >= 0; i--) {
    var range = ranges[i], from = range.to().line + 1, to = range.from().line;
    if (range.to().ch == 0 && !range.empty()) from--;
    if (from < at) linesToMove.push(from, to);
    else if (linesToMove.length) linesToMove[linesToMove.length - 1] = to;
    at = to;
  }
  cm.operation(function() {
    for (var i = linesToMove.length - 2; i >= 0; i -= 2) {
      var from = linesToMove[i], to = linesToMove[i + 1];
      var line = cm.getLine(from);
      if (from == cm.lastLine())
        cm.replaceRange("", Pos(from - 1), Pos(from), "+swapLine");
      else
        cm.replaceRange("", Pos(from, 0), Pos(from + 1, 0), "+swapLine");
      cm.replaceRange(line + "\n", Pos(to, 0), null, "+swapLine");
    }
    cm.scrollIntoView();
  });
};

cm.setOption("extraKeys", extraKeys);

/* vim mode */

var fatCursor;
var vimMode = !!JSON.parse(localStorage.vimMode || false);
cm.setOption('keyMap', vimMode ? 'vim' : 'default');

function toggleVim() {
  vimMode = !vimMode;
  cm.setOption('keyMap', vimMode ? 'vim' : 'default');
  localStorage.vimMode = vimMode;
  fatterCursor();
}

function fatterCursor() {
  /* helper functions from vim.js */

  var copyCursor = function(cur) {
    return Pos(cur.line, cur.ch);
  }

  function lineLength(cm, lineNum) {
    return cm.getLine(lineNum).length;
  }

  var clipCursorToContent = function(cm, cur, includeLineBreak) {
    var line = Math.min(Math.max(cm.firstLine(), cur.line), cm.lastLine() );
    var maxCh = lineLength(cm, line) - 1;
    maxCh = (includeLineBreak) ? maxCh + 1 : maxCh;
    var ch = Math.min(Math.max(0, cur.ch), maxCh);
    return Pos(line, ch);
  }

  var offsetCursor = function(cur, offsetLine, offsetCh) {
    if (typeof offsetLine === 'object') {
      offsetCh = offsetLine.ch;
      offsetLine = offsetLine.line;
    }
    return Pos(cur.line + offsetLine, cur.ch + offsetCh);
  }

  /* vim's default fat-cursor is fixed-width,
   * which doesn't work for our sans-serif font */
  if (fatCursor) {
    fatCursor.clear();
  }

  var vim = cm.state.vim;
  if (vim && !vim.visualMode && !vim.insertMode) {
    var from = clipCursorToContent(cm, copyCursor(cm.getCursor('head')));
    var to = offsetCursor(from, 0, 1);
    fatCursor = cm.markText(from, to, {className: 'cm-animate-fat-cursor'});
  }
}

cm.on('cursorActivity', function(cm, val) {
  fatterCursor();
});

cm.on('vim-mode-change', function(cm, val) {
  fatterCursor();
});


/* completion */

function sb(text) {
  var script = scratchblocks2.parse_scripts(text)[0];
  var s = scratchblocks2.render_stack(script)[0];
  s.classList.add('script');
  return el('.sb2.inline-block', s);
}

function inputSeek(dir) {
  // TODO fix for ellipsises
  var l = tokenizeAtCursor({ splitSelection: false });
  if (!l) return false;
  if (l.selection.indexOf('\n') > -1) return false;

  var index = l.cursor + dir;
  if (dir > 0 && l.tokens[l.cursor] && l.tokens[l.cursor].text === '-') index += 1;
  for (var i = index;
       dir > 0 ? i < l.tokens.length : i >= 0;
       i += dir
  ) {
    var token = l.tokens[i];
    if (['symbol', 'lparen', 'rparen', 'langle', 'rangle',
         'lsquare', 'rsquare'].indexOf(token.kind) === -1) {
      var start = l.start.ch + measureTokens(l.tokens.slice(0, i));
      end = start + token.text.replace(/ *$/, "").length;
      var line = l.from.line;
      if (token.kind === 'number' && l.tokens[i - 1].text === '-') start--;
      if (token.kind === 'string') { start++; end--; }

      var from = { line: line, ch: start };
      var to = { line: line, ch: end };
      if (l.cursor.ch === from.ch && l.cursor.ch + l.selection.length === to.ch) {
        continue;
      }
      cm.setSelection(from, to);
      return true;
    }
  }

  c = dir > 0 ? l.end : l.start;
  if (c.ch === l.cursor.ch) return false;
  cm.setCursor(c);
  return true;
}

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

function requestHint() {
  cm.showHint({
    hint: computeHint,
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
}

function expandCompletions(completions, g) {
  function expand(symbol) {
    if (typeof symbol !== 'string') {
      return [[symbol]];
    }
    if (/^@/.test(symbol)) {
      return [g.rulesByName[symbol][0].symbols];
    } if (/^[md]_/.test(symbol) || /^[A-Z]/.test(symbol)) {
      return (g.rulesByName[symbol] || []).map(function(rule) {
        return rule.symbols;
      });
    }
    return [[symbol]];
  }

  var choices = [];
  completions.forEach(function(c) {
    var symbols = c.completion;
    if (!symbols.length) return;
    var first = symbols[0],
    rest = symbols.slice(1);
    var more = expand(first).map(function(symbols) {
      return {
        completion: symbols.concat(rest),
        via: c,
      };
    });
    choices = choices.concat(more);
  });
  return choices;
}

function computeHint() {
  var l = tokenizeAtCursor({ splitSelection: true });
  if (!l) return false;
  if (l.cursor === 0) {
    if (l.state.indent > 0) {
      var result = {
        list: [{
          text: 'end',
          hint: applyHint,
        }, {
          text: 'else',
          hint: applyHint,
        }],
        from: l.from,
        to:   l.to,
      };
      return result;
    }
    return false;
  }
  /*
  if (!(l.selection === "" || l.selection === "_" ||
        l.selection === "<>")) {
    return false;
  }*/

  var g = l.state.grammar;
  var parser = new Earley.Parser(g);

  var tokens = l.tokens.slice();
  var cursor = l.cursor;
  var partial;
  var isValid;
  if (l.isPartial) {
    partial = tokens[cursor - 1];
    tokens.splice(cursor - 1, 1);
    cursor--;

    try {
      parser.parse(tokens); isValid = true;
    } catch (e) {
      isValid = false;
      // console.log(e); // DEBUG
    }
  }

  var completer = new Earley.Completer(g);
  var completions = completer.complete(tokens, cursor);
  if (!completions) {
    return false; // There was an error!
  }

  completions.filter(function(c) {
    if (c.pre.length === 1 && typeof c.pre[0] === "string") return;
    if (c.pre[0] === "block") return;
    if (c.rule.process.name === 'unaryMinus') return;
    if (c.rule.process._info === undefined) return;
    return true;
  });

  var expansions = expandCompletions(completions, g);
  expansions.forEach(function(x) {
    x.length = x.via.end - x.via.start;
  });

  expansions.sort(function(a, b) {
    return a.length < b.length ? +1 : a.length > b.length ? -1 : 0;
  });
  /*
  if (expansions.length) {
    var shortest = Math.min.apply(null, expansions.map(function(x) {
      return x.completion.filter(function(symbol) { return symbol.kind !== 'symbol' }).length;
    }));
    expansions = expansions.filter(function(x) {
      var length = x.completion.filter(function(symbol) { return symbol.kind !== 'symbol' }).length;
      return length === shortest;
    });
  }
  */

  if (l.isPartial) {
    expansions = expansions.filter(function(x) {
      var first = x.completion[0];
      return (first.kind === 'symbol' && partial.kind === 'symbol' &&
              first.value.indexOf(partial.value) === 0
        ); // || (typeof first === 'string' && x.via.pre.length);
    });
  } else {
    // don't complete keys!
    expansions = expansions.filter(function(x) {
      var first = x.completion[0];
      return !(first.kind === 'symbol' && /^[a-z0-9]$/.test(first.value));
    })

    if (cursor === tokens.length) {
      expansions = expansions.filter(function(x) {
        return x.via.pre.length || x.via.post.length;
      })
    }
  }

  var list = [];
  expansions.forEach(function(x) {
    var symbols = x.completion.slice();
    var c = x.via;

    assert(symbols.length);

    var selection;
    var text = "";
    var displayText = "";
    for (var i=0; i<symbols.length; i++) {
      var part = symbols[i];
      var displayPart = undefined;

      if (i > 0 && part.value !== "?") {
        displayText += " ";
        text += " ";
      }

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

          if (partial && i === 0) {
            displayPart = part;
            part = partial.value;
            if (!selection) selection = { ch: text.length + part.length, size: 0 };
          } else {
            if (!selection) selection = { ch: text.length, size: part.length };
          }

          /*
          if (l.isPartial && i === 0) {
            // Sometimes we need more than one token!
            // Not sure what to do about this…

            var token = l.tokens[l.cursor - 1];
            displayPart = part;
            part = token.text;
            selection = { ch: part.length };
          }
          */
        }
      } else if (part && part.kind === "symbol") {
        part = part.value;
      } else {
          return;
      }
      text += part;
      displayText += (displayPart === undefined ? part : displayPart);
    }

    if (displayText === "<>" || displayText === "_") return;

    assert(text);

    text += " ";

    var completion = {
      displayText: displayText,
      text: text,
      hint: applyHint,
      selection: selection,
    };

    /*
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
    */

    list.push(completion);
  });

  var result = {
    list: list,
    from: l.from,
    to:   l.to,
  };

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
    cm.indentLine(l.start.line);
  }

  return result;
};


/* custom block definitions */

cm.on('change', function(cm, change) {
  var lines = [];
  for (var i=change.from.line; i<=change.to.line; i++) {
    lines.push(cm.getLine(i));
  }
  lines = lines.concat(change.removed);
  lines = lines.concat(change.text);
  onChange(lines);
});

function onChange(affectedLines) {
  for (var i=0; i<affectedLines.length; i++) {
    var line = affectedLines[i];
    if (/^define /.test(line)) {
      refreshDefinitions();
      break;
    }
  }
}

function refreshDefinitions() {
  var contents = cm.getValue();
  var lines = contents.split('\n');

  var defineParser = new Earley.Parser(Language.defineGrammar);

  var definitions = [];
  lines.forEach(function(line) {
    if (!/^define /.test(line)) return;
    var tokens = Language.tokenize(line);
    var results;
    try {
      results = defineParser.parse(tokens);
    } catch (e) { return; }
    if (results.length > 1) throw "ambiguous define. count: " + results.length;
    var define = results[0];
    definitions.push(define);
  });

  var oldDefinitions = cm.getOption('scratchDefinitions');
  if (JSON.stringify(oldDefinitions) !== JSON.stringify(definitions)) {
    // refresh syntax highlighting
    cm.setOption('scratchDefinitions', definitions);
    cm.setOption('mode', 'tosh');
  }
}

/*****************************************************************************/

var Project = Format.Project;
var Oops = new Format.Oops;

var App = new function() {
  var _this = this;
  this.project = ko(Project.new());

  this.tab = ko('data');

  this.editorDirty = false;
  this.phosphorusDirty = true;
  this.projectDirty = false;

  // active
  this.active = ko(this.project().sprites()[0]);
  this.activeIsStage = this.active.compute(function(active) {
    return !!active._isStage;
  });

  // variables & lists
  this.activeVariables = ko([]);
  this.activeLists = ko([]);
  this.active.subscribe(function(s) {
    s.variables.subscribe(function(array) {
      if (_this.active() !== s) return;
    _this.activeVariables.assign(array);
    });
  });
  this.active.subscribe(function(s) {
    s.lists.subscribe(function(array) {
      if (_this.active() !== s) return;
    _this.activeLists.assign(array);
    });
  });

  // textarea
  var lastActive;
  this.active.subscribe(function(s) {
    if (lastActive) App.flushEditor(lastActive);

    var code = Compiler.generate(s.scripts);
    cm.setValue(code);
    lastActive = s;
  });
};


/* sprite switcher */

App.project.subscribe(function(p) {
  function switcher(s) {
    return el('.sprite', {
      class: ko(function() { return App.active() === s ? 'active' : '' }),
      on_click: function(e) { App.active.assign(s) },
    }, [
      //sprite.costumes[0].image,
      el('span.name', s.objName),
    ]);
  }

  replaceChildren($('#switcher')[0], [
    switcher(p),
    el('', p.sprites.map(switcher)),
  ]);
});


/* ide */

function NamesEditor(kind, names, factory, addText) {

  var variableList = names.map(function(variable) {
    return el('li', el('p', ko(function() {
        var input = el('input', {
          bind_value: variable._name,
          placeholder: "my variable",

          on_focus: function() { variable._isEditing.assign(true); },
          on_blur:  function() { variable._isEditing.assign(false); },

          on_keydown: function(e) {
            var start = this.selectionStart,
                end = this.selectionEnd,
                prefix = this.value.slice(0, start),
                selection = this.value.slice(start, end),
                suffix = this.value.slice(end);
            switch (e.keyCode) {
              case 13: // Return
                variable._name.assign(prefix.trim());

                var index = names().indexOf(variable);
                var newVar;
                if (selection) {
                  newVar = factory(suffix.trim());
                  names.insert(index + 1, newVar);

                  newVar = factory(selection.trim());
                  names.insert(index + 1, newVar);
                  newVar._isEditing.assign(true);
                } else {
                  newVar = factory(suffix.trim());
                  names.insert(index + 1, newVar);
                  newVar._isEditing.assign(true);
                }
                break;
              case 8: // Backspace
                if (variable._name()) {
                  return;
                }
                var index = names().indexOf(variable);
                names.remove(index);
                if (names().length) {
                  var focusIndex = index > 0 ? index - 1 : 0;
                  names()[focusIndex]._isEditing.assign(true);
                }
                break;
              case 46: // Delete
                if (variable._name()) {
                  return;
                }
                var index = names().indexOf(variable);
                names.remove(index);
                if (names().length) {
                  names()[index]._isEditing.assign(true);
                }
                break;
              case 38: // Up
                var index = names().indexOf(variable);
                if (index - 1 >= 0) {
                  names()[index - 1]._isEditing.assign(true);
                }
                break;
              case 40: // Down
                var index = names().indexOf(variable);
                if (index + 1 < names().length) {
                  names()[index + 1]._isEditing.assign(true);
                }
                break;
              case 27: // Escape
                variable._isEditing.assign(false);
                break;
              default:
                return;
            }
            e.preventDefault();
          },
        }, variable._name);

        variable._isEditing.subscribe(function(value) {
          if (value) { input.focus(); } else { input.blur(); }
        }, false);

        return input;
      })
    ));
  });

  return [
    el('h2', kind[0].toUpperCase() + kind.slice(1) + " names"),
    el('ul.reporters', { class: kind }, variableList),
    el('p.new a', {
      on_click: function() {
        var newVar = factory('');
        names.push(newVar);
        newVar._isEditing.assign(true);
      },
    }, addText),
  ];
}

var addNameText = App.activeIsStage.compute(function(isStage) {
  return isStage ? "＋ for all sprites" : "＋ for this sprite";
});

var deviceKind = windowSize.compute(function(size) {
  return size.width > 960 ? 'desktop'
       : size.width > 800 ? 'tablet'
                          : 'phone';
});

ko(function() {
  var classes = ['wrap', 'app', 'not-desktop', 'not-tablet', 'not-phone'];
  classes.push(deviceKind());
  classes.splice(classes.indexOf('not-' + deviceKind()), 1);
  classes.push('tab-' + App.tab());
  document.body.className = classes.join(' ');
});

var tabs = deviceKind.compute(function(kind) {
  var tabs = [
    'data',
    'costumes',
    'sounds',
  ];
  if (kind === 'phone') {
    tabs.splice(0, 0, 'code');
  }
  if (kind !== 'desktop') {
    tabs.push('player');
    tabs.splice(0, 0, 'sprites');
  }
  if (kind === 'phone') {
    tabs.splice(0, 0, 'options');
  }
  return tabs;
});

tabs.subscribe(function(tabs) {
  var preference = [App.tab(), 'code', 'player', 'data'];
  for (var i=0; i<preference.length; i++) {
    var name = preference[i];
    if (tabs.indexOf(name) > -1) {
      App.tab.assign(name);
      return;
    }
  }
});

deviceKind.subscribe(fixEditorLayout);
App.tab.subscribe(function() { setTimeout(fixEditorLayout, 0) });

replaceChildren($('#tab-bar')[0], [
  el('.tabs', tabs.map(function(name) {
    return el('li', {
      class: App.tab() === name ? 'active' : '',
      on_click: function() {
        App.tab.assign(name);
      },
    }, el('span', name));
  }))
]);

replaceChildren($('#sidebar')[0], [
  el('#data.tab.active', (
    new NamesEditor('variable', App.activeVariables, Project.newVariable, addNameText)
  ).concat(
    new NamesEditor('list', App.activeLists, Project.newList, addNameText)
  )),
  el('#costumes.tab'),
  el('#sounds.tab'),
]);

function bindModeNames(appList, cfgOption, property) {
  var timeout;

  function updated() {
    var names = appList();
    if (!App.activeIsStage()) {
      // include global var/list names
      names = names.concat(App.project()[property]());
    }
    cm.setOption(cfgOption, names);
    cm.setOption('mode', 'tosh');
    clearTimeout(timeout);
  }

  appList.subscribe(function(array) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(updated, 1000);
    array.forEach(function(variable) {
      variable._name.subscribe(updated);
    });
  });
}

// when names edited, refresh CM syntax highlighting
bindModeNames(App.activeVariables, 'scratchVariables', 'variables');
bindModeNames(App.activeLists, 'scratchLists', 'lists');


/*****************************************************************************/

/* compiling */

cm.on('change', function(cm) {
  requestHint();
  App.editorDirty = true;
  App.phosphorusDirty = true;
  App.projectDirty = true;
});

App.sync = function() {
  /* copy data back from phosphorus */
  var phosphorus = App.stage;
  if (!phosphorus) return;

  [phosphorus].concat(phosphorus.children).forEach(function(s) {
    if (s.isStage || s.isSprite) {
      if (s.isClone) return;

      var t = s._tosh;
      assert(t.objName() === s.objName);

      // variables could be created after we last sent the project to
      // phosphorus, so we have fallback values
      t.variables().forEach(function(variable) {
        var name = variable._name();
        variable.value = s.vars[name] || 0;
      });
      t.lists().forEach(function(list) {
        var name = list._name();
        list.contents = s.lists[name] || [];
      });
      t.currentCostumeIndex = s.currentCostumeIndex;

      if (s.isStage) {
        t.tempoBPM = s.tempoBPM;
      } else {
        t.scratchX = s.scratchX;
        t.scratchY = s.scratchY;
        t.direction = s.direction;
        t.rotationStyle = s.rotationStyle;
        t.visible = s.visible;
      }

    } else if (s.target) {
      // Watcher
    }

  });
}

App.makeZip = function() {
  App.sync();
  App.flushEditor(App.active());

  var zip = Project.save(App.project());
        var json = JSON.parse(zip.file('project.json').asText());
        window.json = json;
  var file = zip.generate({ type: 'blob' });
  return file;
}

App.save = function() {
  var file = this.makeZip();
  var a = el('a', {
    style: 'display: none;',
    download: App.project()._fileName + '.sb2',
    href: URL.createObjectURL(file),
  }, " ");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

App.preview = function(start) {
  App.isCompiling = true;

  // Switch to Player tab
  if (tabs().indexOf('player') > -1) App.tab.assign('player');

  // remove "internal error" message -- phosphorus doesn't do this by itself
  var errEl = $('#phosphorus .internal-error')[0];
  if (errEl) errEl.parentNode.removeChild(errEl);

  var file = this.makeZip();
  // TODO don't create a zip here
  if (App.stage) {
    App.stage.stopAll();
  }
  this.phosphorusDirty = false; // we're sending phosphorus a zip
  var request = P.IO.loadSB2File(file);
  P.player.showProgress(request, function(stage) {
    App.isCompiling = false;
    App.stage = stage;

    [stage].concat(stage.children).forEach(function(s) {
      if (s.isStage) {
        s._tosh = App.project();
      } else if (s.isSprite) {
        // TODO: is there a bug here re: indexInLibrary?
        s._tosh = App.project().sprites()[s.indexInLibrary];
      }
    });

    if (start) {
      stage.focus();
      stage.triggerGreenFlag();
    } else {
      cm.focus();
    }
  });
};

App.preFlagClick = function() {
  if (App.phosphorusDirty) {
    App.preview(true);
    return true; // tells phosphorus to give up
  }
};

App.flushEditor = function(target) {
  // TODO better way to get thing out of CodeMirror?
  var finalState = cm.getStateAfter(cm.getDoc().size, true);
  function compileLine(b) {
    if (!b) return b;
    if (b.info) {
      return [b.info.selector].concat((b.args || []).map(compileLine));
    } else {
      if (b.value) return b.value;
      return b;
    }
  }

  cm.clearGutter('errors');
  var lines = finalState.lines.slice();
  try {
    var scripts = Compiler.compile(lines);
  } catch (e) {
    console.log(e);
    var line = finalState.lines.length - lines.length + 1;
    var marker = el('div.error', { style: 'color: #822;'}, "●")
    cm.setGutterMarker(line, 'errors', marker);
    throw e;
    return;
  }

  target.scripts = scripts;
};



/* undo 'n' stuff */

// sprites: create, rename, delete
// replace scripts
// replace variables
// replace lists
// costumes: create, move, rename, delete
// sounds: create, move, rename, delete

Oops.actions = {
  /* [init, undo, redo] */
  'setProperty': {
    init: function(obj, property, after) {
      var before = obj[property];
      if (before == after) return;
      return [obj, property, before, after];
    },
    redo: function(obj, property, before, after) { obj[property] = after; },
    undo: function(obj, property, before, after) { obj[property] = before; },
  },
  'insert': {
    init: function(list, index, item) {
      if (!item) {
        item = index;
        index = list.length;
      }
      return [list, index, item];
    },
    redo: function(list, index, item) { list.splice(index, 0, item); },
    undo: function(list, index, item) { list.splice(index, 1); },
  },
  'remove': {
    redo: function(list, index, item) { list.splice(index, 1); },
    undo: function(list, index, item) { list.splice(index, 0, item); },
  },
  'move': {
    redo: function(list, indexBefore, indexAfter) {
      var item = list.splice(indexBefore, 1)[0];
      list.splice(indexAfter, 0, item);
    },
    undo: function(list, indexBefore, indexAfter) {
      this.redo(list, indexAfter, indexBefore);
    },
  },

  /* * */

  'replaceProject': {
    init: function(newProject) {
      return [App.project(), newProject];
    },
    redo: function(before, after) {
      App.project.assign(after);
    },
    undo: function(app, before, after) {
      App.project.assign(before);
    },
    end: function() {
      App.active.assign(App.project().sprites()[0]);

      App.preview(false); // calls App.flushEditor() !
    },
  },

  'newSprite': {
    redo: function(project) {
      project.sprites.push(Project.newSprite());
      project.children.push(Project.newSprite());
      App.switchSprite(project.sprites().length - 1);
    },
    undo: function(project) {
      project.sprites.pop();
    },
  },

  'deleteSprite': {
    init: function(project, index) {
      var sprite = project.sprites()[index];
      var childIndex = project.children.indexOf(sprite);
      return [project, sprite, index, childIndex];
    },
    redo: function(project, sprite, spriteIndex, childIndex) {
      project.sprites.splice(spriteIndex, 1);
      project.children.splice(childIndex, 1);
      App.switchSprite(project.sprites.length - 1);
    },
    undo: function(project, sprite, spriteIndex, childIndex) {
      project.sprites.splice(spriteIndex, 0, sprite);
      project.children.splice(childIndex, 0, sprite);
      App.switchSprite(spriteIndex);
    },
  },

};


/*
oops.bind('project', function(target) {
  App.dirty = true;
});

oops.bind('', function(target) {
  if (target !== '') return;
  App.spriteIndex = 0;
});

oops.bind('project.sprites', function(target, name) {
  if (target === 'project.sprites') {
    if (name === 'insert' || App.spriteIndex >= App.project.sprites.length) {
      App.spriteIndex = App.project.sprites.length - 1;
    }
  } else {
    App.spriteIndex = parseInt(target.split('.')[2] || -1);
  }
});

// script

function updateScript(target, op) {
}
oops.bind('spriteIndex', updateScript);
oops.bind('project.sprites', function(target, op) {
  if (target.indexOf('project.sprites.' + App.spriteIndex) === 0) {
    updateScript(target, op);
  }
});
*/



// events

document.addEventListener('keydown', function(e) {
  if (e.metaKey && e.ctrlKey) return;
  var keyCode = e.keyCode;
  if (e.altKey) {
    if (e.metaKey || e.ctrlKey) return;

    // Alt + keys 1-9
    if (keyCode > 48 && keyCode < 58) {
      var index = keyCode - 49;
      if (index < tabs().length) {
        App.tab.assign(tabs()[index]);
      }
      e.preventDefault();
    }
    return;
  }
  if (isMac ? e.metaKey : e.ctrlKey) {
    // global C-bindings
    switch (keyCode) {
      case 13: // run:  ⌘↩
        var vim = cm.state.vim;
        if (!vim || (!vim.visualMode && !vim.insertMode)) {
          App.preview(true);
        }
        e.preventDefault();
        break;
      case 83: // save: ⌘S
        App.save();
        e.preventDefault();
        break;
      case 89: // undo: ⌘Z
        Oops.undo();
        break;
      case 90: // redo: ⌘⇧Z ⌘Y
        if (e.shiftKey) {
          if (isMac) {
            Oops.redo();
            break;
          }
        } else {
          Oops.undo();
          break;
        }
        break;
      default: return;
    }
  } else {
    // plain, document-only bindings
    if (e.target !== document.body) return;
    if (e.metaKey || e.ctrlKey) return;
    switch (keyCode) {
      case 8: // backspace
        break;
      default: return;
    }
  }
  e.preventDefault();
});

// project controls...
var phosphorusPlayer = $('.player')[0];
phosphorusPlayer.addEventListener('keydown', function(e) {
  if (!App.stage) return;
  if (/INPUT/i.test(e.target.tagName)) return;
  switch (e.keyCode) {
    case 13: // green flag:  ↩
      $('.flag')[0].click();
      break;
    case 27: // stop:  ESC
      if (App.stage) {
        if (tabs().indexOf('code') > -1) App.tab.assign('code');
        cm.focus();
        break;
      }
    default:
      return;
  }
  e.preventDefault();
}, true);

// dim play/stop buttons unless running
setInterval(function() {
  var isRunning = App.stage && App.stage.isRunning;
  setClassBool(phosphorusPlayer, 'running', isRunning);
  setClassBool(phosphorusPlayer, 'not-running', !isRunning);
}, 200);

// happy vim :w
cm.save = App.preview.bind(App);

// drop file to open

function cancel(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}
document.body.addEventListener('dragover', cancel);
document.body.addEventListener('dragenter', cancel);

document.body.addEventListener('drop', function(e) {
  e.preventDefault();

  var f = e.dataTransfer.files[0];
  if (!f) return;

  var parts = f.name.split('.');
  var ext = parts.pop();
  var fileName = parts.join('.');
  if (ext === 'sb2' || ext === 'zip') {
    var reader = new FileReader;
    reader.onloadend = function() {
      var ab = reader.result;
      var zip = new JSZip(ab);
      var project = Project.load(zip);
      project._fileName = fileName;
      Oops.do('replaceProject', project);
    };
    reader.readAsArrayBuffer(f);
  }
});

window.onbeforeunload = function(e) {
  return 'Ahhh';
};

/*****************************************************************************/

// prepare phosphorus

App.preview(false);

