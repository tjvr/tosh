var editor = document.getElementById('editor');

var cm = CodeMirror(editor, {
  value: "",
  mode: "tosh",

  indentUnit: 3,
  tabSize: 3,
  indentWithTabs: true,

  lineNumbers: true,
  gutters: ["CodeMirror-linenumbers", "errors"],

  autofocus: true,

  cursorHeight: 1,
});

var onResize = function() {
  cm.setSize(editor.clientWidth, editor.clientHeight)
};
window.addEventListener('resize', onResize);
onResize();

/*****************************************************************************/

/* editor */

cm.setOption("extraKeys", {
  'Shift-Ctrl-K': function(cm) {
    toggleVim();
  },
  'Ctrl-Space': function(cm) {
    showHint();
  },
  'Tab': function(cm) {
    if (!cm.somethingSelected()) {
      if (showHint()) return;
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
});

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

  var Pos = CodeMirror.Pos;

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
    if (token.kind !== 'symbol') {
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
  function r(dom) {
    return function(container) {
      if (typeof dom === 'string') dom = document.createTextNode(dom);
      container.appendChild(dom);
    };
  }

  var l = tokenizeAtCursor({ splitSelection: true });
  if (!l) return false;
  if (l.cursor === 0) return false;
  if (!(l.selection === "" || l.selection === "_" ||
        l.selection === "<>")) {
    return false;
  }

  var g = l.state.grammar;
  var parser = new Earley.Parser(g);

  if (l.isPartial && l.cursor === l.tokens.length) {
    l.tokens[l.cursor - 1].isPartial = false;
    try {
      parser.parse(l.tokens); return false;
    } catch (e) { console.log(e); }
    l.tokens[l.cursor - 1].isPartial = true;
  }

  var completer = new Earley.Completer(g);
  var completions = completer.complete(l.tokens, l.cursor);
  if (!completions) {
    return false; // There was an error!
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
      } else if (part && part.kind === "symbol") {
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

  var result = {
    list: list,
    from: l.from,
    to:   l.to,
  };

  cm.showHint({
    hint: function(cm, options) {
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

  if (list.length === 0) return false;

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

  return true;
};

/*****************************************************************************/

var Project = Format.Project;
var Oops = Format.Oops;

var App = new function() {
  this.project = Project.new();
  this.spriteIndex = 0;

  this.editorDirty = false;
  this.phosphorusDirty = true;
  this.projectDirty = false;

  this.activeIsStage = ko(false);
};


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
                if (names.length()) {
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
                if (names.length()) {
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
                if (index + 1 < names.length()) {
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

replaceChildren($('#sidebar')[0], [
  el('ul#tabs', [
    el('li.active span', "Data"),
    el('li span', "Costumes"),
    el('li span', "Sounds"),
  ]),
  el('#data.tab.active', (
    new NamesEditor('variable', App.project.variables, Project.newVariable, addNameText)
  ).concat(
    new NamesEditor('list', App.project.lists, Project.newList, addNameText)
  )),
  el('#costumes.tab'),
  el('#sounds.tab'),
]);




/*****************************************************************************/

/* compiling */

cm.on('change', function(cm) {
  showHint();
  App.editorDirty = true;
  App.phosphorusDirty = true;
  App.projectDirty = true;
});

App.sync = function() {
  /* grab data out of phosphorus */
  var phosphorus = App.stage;
  if (!phosphorus) return;

  [phosphorus].concat(phosphorus.children).forEach(function(s) {
    if (s.isStage || s.isSprite) {
      var t = s._tosh;
      assert(t.objName === s.objName);

      t.variables.forEach(function(variable) {
        variable.value = s.vars[variable.name];
      });
      t.lists.forEach(function(list) {
        list.contents = s.lists[list.listName];
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
  App.flushEditor();

  var zip = Project.save(App.project);
        var json = JSON.parse(zip.file('project.json').asText());
        window.json = json;
  var file = zip.generate({ type: 'blob' });
  return file;
}

App.save = function() {
  var file = this.makeZip();
  var a = el('a', {
    style: 'display: none;',
    download: 'tosh.sb2',
    href: URL.createObjectURL(file),
  }, " ");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

App.preview = function(start) {
  App.isCompiling = true;

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
        s._tosh = App.project;
      } else if (s.isSprite) {
        s._tosh = App.project.sprites[s.indexInLibrary];
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

App.flushEditor = function() {
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

  var target = 'project.sprites.' + App.spriteIndex;
  oops.do(target, 'setProperty', 'scripts', scripts);
};

App.switchSprite = function(index) {
  this.spriteIndex = index;
  var sprite = this.project.sprites[this.spriteIndex];
  console.log('switchSprite', sprite.objName);
};




var oops = new Oops(App);

Oops.add('replaceProject', {
  init: function(app, newProject) {
    return [app, app.project, newProject];
  },
  redo: function(app, before, after) {
    app.project = after;
  },
  undo: function(app, before, after) {
    app.project = before;
  },
  after: function(app) {
    App.switchSprite(0);

    var code = Compiler.generate(app.project.sprites[0].scripts);
    cm.setValue(code);

    App.preview(false); // calls App.flushEditor() !
  },
});


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

Oops.add('newSprite', {
  redo: function(project) {
    project.sprites.push(Project.newSprite());
    project.children.push(Project.newSprite());
    App.switchSprite(project.sprites.length - 1);
  },
  undo: function(project) {
    project.sprites.pop();
  },
});

Oops.add('deleteSprite', {
  init: function(project, index) {
    var sprite = project.sprites[index];
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



// events

var isMac = /Mac/i.test(navigator.userAgent);

document.addEventListener('keydown', function(e) {
  if (e.altKey) return;
  if (e.metaKey && e.ctrlKey) return;
  if (isMac ? e.metaKey : e.ctrlKey) {
    // global C-bindings
    switch (e.keyCode) {
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
        oops.undo();
        break;
      case 90: // redo: ⌘⇧Z ⌘Y
        if (e.shiftKey) {
          if (isMac) {
            oops.redo();
            break;
          }
        } else {
          oops.undo();
          break;
        }
        break;
      default: return;
    }
  } else {
    // plain, document-only bindings
    if (e.target !== document.body) return;
    if (e.metaKey || e.ctrlKey) return;
    switch (e.keyCode) {
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
  switch (e.keyCode) {
    case 13: // green flag:  ↩
      $('.flag')[0].click();
      break;
    case 27: // stop:  ESC
      if (App.stage) {
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

  var ext = f.name.split('.').pop();
  if (ext === 'sb2' || ext === 'zip') {
    var reader = new FileReader;
    reader.onloadend = function() {
      var ab = reader.result;
      var zip = new JSZip(ab);
      var project = Project.load(zip);
      oops.do('', 'replaceProject', project);
    };
    reader.readAsArrayBuffer(f);
  }
});




/*****************************************************************************/

// prepare phosphorus

App.preview(false);

