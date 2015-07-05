var localStorage = window.localStorage;

var editor = document.getElementById('editor');

var cm = CodeMirror(editor, {
  value: localStorage['editor_content'] || "",
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

document.addEventListener('keydown', function(e) {
  if ((e.metaKey || e.ctrlKey) && e.keyCode === 13) {
    e.preventDefault();
    compile();
  }
});

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

/* ide */

replaceChildren($('#sidebar')[0], [
  el('ul#tabs', [
    el('li.active span', "Data"),
    el('li span', "Costumes"),
    el('li span', "Sounds"),
  ]),
  el('#data.tab.active', [
    el('h2', "Variable names"),
    el('ul.variable.reporters', [
      el('li span', "score"),
      el('li span', "vx"),
      el('li span', "vy"),
      el('li span', "link.from"),
      el('li span', "link.to"),
      el('li span', "game over?"),
      el('li.new a', "＋ for all sprites"),
    ]),
    el('h2', "List names"),
    el('ul.list.reporters', [
      el('li span', "nodes"),
      el('li span', "links.from"),
      el('li span', "links.to"),
      // el('li span.edit', el('input', { value: 'links.type' })),
      el('li.new a', "＋ for all sprites"),
    ]),
  ]),
  el('#costumes.tab'),
  el('#sounds.tab'),
]);



/*****************************************************************************/

/* compiling */

cm.on('change', function(cm) {
  window.localStorage['editor_content'] = cm.getValue();
  showHint();
});

function exportPhosphorus(json) {
  P.IO.init();

  var request = P.IO.loadJSONProject(json);
  P.player.load2(request, function(stage) {
    stage.triggerGreenFlag();
  });
}

function makeJson(scripts) {
  var scriptCount = scripts.length;

  /*var scripts = [
    [20, 20, [
      ['whenGreenFlag'],
      ['doForever', [
        ['forward:', 10],
      ]],
    ]],
  ];*/

  var turtle = {
    objName: 'turtle',
    indexInLibrary: 1,

    direction: 90.0,
    isDraggable: false,
    rotationStyle: 'normal',
    scale: 1.0,
    scratchX: 0,
    scratchY: 0,
    visible: true,
    spriteInfo: {},

    variables: [],
    lists: [],

    scriptComments: [],
    scripts: scripts,

    costumes: [{
      costumeName: "eyes",
      baseLayerID: 1,
      baseLayerMD5: "84f3647091b0f31dbb12d1bdddf72bf7.png",
      bitmapResolution: 2,
      rotationCenterX: 143,
      rotationCenterY: 98
    }, {
      costumeName: "blink",
      baseLayerID: 2,
      baseLayerMD5: "0a1be9a3d3179ef883fc30787c9990a6.png",
      bitmapResolution: 2,
      rotationCenterX: 142,
      rotationCenterY: 100
    }],
    currentCostumeIndex: 0,

    sounds: [{
      soundName: "meow",
      soundID: 0,
      md5: "83c36d806dc92327b9e7049a565c6bff.wav",
      sampleCount: 18688,
      rate: 22050,
      format: "",
    }],
  };

  var json = {
    objName: 'Stage',

    penLayerID: 0,
    penLayerMD5: 'hi',
    tempoBPM: 60,
    videoAlpha: 0.5,
    info: {
      scriptCount: scriptCount,
      spriteCount: 1,
      videoOn: false,
    },

    variables: [],
    lists: [],

    scripts: [],
    scriptComments: [],

    costumes: [{
      costumeName: "backdrop1",
      baseLayerID: 3,
      baseLayerMD5: "739b5e2a2435f6e1ec2993791b423146.png",
      bitmapResolution: 1,
      rotationCenterX: 240,
      rotationCenterY: 180
    }],
    currentCostumeIndex: 0,

    sounds: [{
      soundName: "pop",
      soundID: 1,
      md5: "83a9787d4cb6f3b7632b4ddfebf74367.wav",
      sampleCount: 258,
      rate: 11025,
      format: "",
    }],

    children: [turtle],
  };

  return json;
};

function measureHeight(blocks) {
  return 100;
}

function compile() {
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
  console.log(finalState.lines.map(compileLine).join('\n'));

  cm.clearGutter('errors');
  var lines = finalState.lines.slice();
  try {
    var scriptBlocks = compileFile(lines);
  } catch (e) {
    console.log(e);
    var line = finalState.lines.length - lines.length + 1;
    var marker = el('div.error', { style: 'color: #822;'}, "●")
    cm.setGutterMarker(line, 'errors', marker);
    return;
  }
  console.log(JSON.stringify(scriptBlocks).replace(/],/g, "],\n"));

  var y = 10;
  var scripts = scriptBlocks.map(function(blocks) {
    var script = [10, y, blocks];
    y += measureHeight(blocks);
    return script;
  });

  var json = makeJson(scripts);
  exportPhosphorus(json);


  var zip = new JSZip();
  zip.file('project.json', JSON.stringify(json));
  var file = zip.generate({type:"blob"});

  var a = $('#save')[0];
  a.href = URL.createObjectURL(file);
  a.download = 'tosh.sb2';
}

function Stream(seq) {
  this.seq = seq;
}
Stream.prototype.token = function() {
  return this.seq[0];
}
Stream.prototype.next = function() {
  this.shift();
}

function compileFile(lines) {
  lines.push({info: {shape: 'eof'}});
  var scripts = [];
  while (true) {
    switch (lines[0].info.shape) {
      case 'blank':
        lines.shift();
        break;
      case 'eof':
        return scripts;
      default:
        scripts.push(compileScript(lines));
        switch (lines[0].info.shape) {
          case 'blank':
            break;
          case 'eof':
            return scripts;
          default:
            assert(false);
        }
    }
  }
}

function compileBlank(lines, isRequired) {
  if (isRequired) {
    assert(lines[0].info.shape === 'blank');
    lines.shift();
  }
  while (true) {
    if (lines[0].info.shape === 'blank') {
      lines.shift();
    } else {
      return;
    }
  }
}

function compileScript(lines) {
  // assert(lines[0].info.shape === 'hat');
  // var hat = compileBlock(lines);
  var blocks = compileBlocks(lines);
  // blocks.insert(0, hat);
  return blocks;
}

function compileBlocks(lines) {
  var result = [];
  if (lines[0].info.shape === 'ellipsis') {
    lines.shift();
    return [];
  }
  while (true) {
    switch (lines[0].info.shape) {
      case 'cap':
        var block = compileBlock(lines);
        if (block) result.push(block);
        return result;
      default:
        var block = compileBlock(lines);
        if (block) {
          result.push(block);
        } else {
          assert(result.length, "Empty c-block mouth");
          return result;
        }
    }
  }
}

function compileBlock(lines) {
  var selector;
  var args;
  switch (lines[0].info.shape) {
    case 'c-block':
      block = lines.shift();
      selector = block.info.selector;
      args = block.args.map(compileReporter);

      args.push(compileBlocks(lines));
      assert(lines[0].info.shape === 'end',
          'Expected "end", not ' + lines[0].info.shape);
      lines.shift();
      break;
    case 'if-block':
      block = lines.shift();
      args = block.args.map(compileReporter);

      args.push(compileBlocks(lines));

      selector = 'doIf';
      switch (lines[0].info.shape) {
        case 'else':
          selector = 'doIfElse';
          lines.shift();

          args.push(compileBlocks(lines));

          // FALL-THRU
        case 'end':
          assert(lines[0].info.shape === 'end',
              'Expected "end", not ' + lines[0].info.shape);
          lines.shift();
          break;
        default:
          assert(false, 'Expected "else" or "end", not ' + lines[0].info.shape);
      }
      break;
    case 'hat':
    case 'stack':
    case 'cap':
      block = lines.shift();
      selector = block.info.selector;
      args = block.args.map(compileReporter);
      break;
    default:
      console.log(lines[0]);
      return;
  }
  console.log(selector, args);
  return [selector].concat(args);
}

function compileReporter(b) {
  if (b.info) {
    return [b.info.selector].concat(b.args.map(compileReporter));
  } else if (b.value) { // ie. a token
    return b.value;
  } else {
    return b;
  }
}


