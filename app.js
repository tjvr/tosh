
var Pos = CodeMirror.Pos;

var Project = Format.Project;

function getEl(view) {
  return view.el;
}

function doNext(cb) {
  setTimeout(function() { cb() }, 0);
}

function windowTop(element) {
  var y = 0;
  do {
    y += element.offsetTop || 0;
    element = element.parentNode;
  } while (element);
  return y;
}

function copyKeyMap(d) {
  return JSON.parse(JSON.stringify(d));
}

/*****************************************************************************/

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

/*****************************************************************************/

var Scriptable = function(s, project) {
  this.sprite = s;
  this.project = project;

  this.scriptsEditor = new ScriptsEditor(s, project);
  s._scriptsEditor = this.scriptsEditor;

  function pane(name, content) {
    return el('.pane.pane-'+name, {
      class: ko(function() { if (App.tab() === name) return 'pane-active'; }),
      children: content,
    });
  }

  this.el = el('.scriptable', {
    class: ko(function() { return App.active() === s ? 'scriptable-active' : '' }),
    children: [
      el('.tabs', ['data', 'costumes', 'sounds'].map(function(name) {
        var tabName = name;
        if (name === 'costumes' && s._isStage) tabName = 'backdrops';
        return el('li.tab', {
          class: ko(function() { if (App.tab() === name) return 'tab-active'; }),
          on_click: function(e) {
            App.tab.assign(name);
          },
          children: el('span', tabName),
        });
      })),

      pane('data', [
        NamesEditor(s, 'variable'),
        NamesEditor(s, 'list'),
      ]),
      pane('costumes', ListEditor(s, 'costume')),
      pane('sounds', ListEditor(s, 'sound')),

      s._scriptsEditor.el,
    ],
  });
};

Scriptable.prototype.activated = function() {
  this.scriptsEditor.activated();
};

Scriptable.prototype.deactivated = function() {
  this.scriptsEditor.repaint();
};

/* ListEditor */

function costumeImage(costume, cb) {
  if (!costume) return;
  var image = costume._$image;
  cb = cb.bind(null, image);
  image.addEventListener('load', cb);
  if (image.src) cb();
}

function costumeThumbnail(costume) {
  var thumb = el('.thumb');
  ko.subscribe(costume, function(costume) {
    costumeImage(costume, function(image) {
      thumb.style.backgroundImage = 'url(' + image.src + ')';
    });
  });
  return thumb;
}

function costumeSize(costume) {
  var stats = ko("..x..");
  costumeImage(costume, function(image) {
    var width = image.naturalWidth / (costume.bitmapResolution || 1);
    var height = image.naturalHeight / (costume.bitmapResolution || 1);
    var result = width + "x" + height;
    if (result === "0x0") result = "";
    stats.assign(result);
  });
  return stats;
}

var renderItem = {
  sprite: function(sprite) {
    var costume = ko(function() {
      if (sprite.objName === 'splat') debugger;
      return sprite.costumes()[sprite.currentCostumeIndex() || 0];
    });
    return el('.details', [
      costumeThumbnail(costume),
      el('.name', sprite.objName),
    ]);
  },
  costume: function(costume, sprite) {
    var size = costume._size;
    return el('.details', [
      costumeThumbnail(costume),
      el('input.name', {
        bind_value: costume.name,
      }),
      el('.media-number', ko(function() {
        return "#" + (sprite.costumes().indexOf(costume) + 1);
      })),
      el('.media-stats', costumeSize(costume)),
    ]);
  },
  sound: function(sound, sprite) {
    return el('.details', [
      // el('.thumb', sound._$audio), // TODO fix <audio>
      el('input.name', {
        bind_value: sound.name,
      }),
      el('.media-number', ko(function() {
        return "#" + (sprite.sounds().indexOf(sound) + 1);
      })),
    ]);
  },
};

var newItem = {
  sprite: Project.newSprite,
  costume: Project.newCostume,
  sound: Project.newSound,
};

var ListEditor = function(obj, kind, active) {
  var items = obj[kind + 's'];
  var displayItems;

  if (kind === 'sprite') {
    displayItems = items.compute(function(sprites) {
      return [obj].concat(sprites);
    });
  } else {
    displayItems = items;
  }

  var render = renderItem[kind];
  var itemEls = displayItems.map(function(item) {
    item._name = item.objName;

    var props = {};
    var buttons = [];

    // TODO ensure unique names
    // TODO undo

    var dragHandle = el('.button.button-handle');

    if (kind === 'sprite') {
      props.class = active.compute(function(active) { if (active === item) return 'sprite-active'; });
      props.on_click = function(e) {
        active.assign(item);
      };

      if (!item._isStage) {
        buttons.push(el('.button.button-edit', {
          on_click: editName,
        }));
      }
    }

    if (!item._isStage) {
      buttons.push(el('.button.button-remove', {
        on_click: removeItem,
        disabled: ko(function() {
          // can't remove last costume
          return kind === 'costume' && items().length === 1;
        }),
      }));
      buttons.push(dragHandle);
    }

    function removeItem() {
      if (this.disabled) return;
      Oops(function() {
        var index = items().indexOf(item);
        // update costume index if needed
        if (kind === 'costume') {
          if (obj.currentCostumeIndex() >= index) {
            obj.currentCostumeIndex.assign(Math.max(0, index - 1));
          }
        }

        // remove
        items.remove(index);

        // remove sprite from children array too
        if (kind === 'sprite') {
          obj.children.splice(obj.children.indexOf(item), 1);
        }
      });
    }

    function editName() {
      var result = prompt("Rename sprite ", item._name());

      // handle cancel
      if (!result) return;

      // TODO ensure unique names
      Oops(function() {
        item._name.assign(result);
      });
    }

    // drag to rearrange
    function pointerDown(e) {
      if (dragging) {
        stopDragging();
        return;
      }

      if (e.target === dragHandle) {
        var placeholder = el('li.' + kind + '.drag-placeholder', " ");
        var index = displayItems().indexOf(item);
        ul.insertBefore(placeholder, itemEl);

        var mouseY = e.clientY - windowTop(ul) + ul.parentNode.scrollTop;
        var top = itemEl.offsetTop - itemHeight; // subtract size of placeholder
        // nb. mouseY + offsetY = top
        assert(top > -2);

        dragging = {
          item: item,
          el: itemEl,
          placeholder: placeholder,
          offsetY: top - mouseY,
          index: index,
          resetIndex: index,
          lastClientY: e.clientY,
          lastMouseY: null,
          interval: setInterval(dragTick, 20),
          scrollSpeed: 0,
        };
        itemEl.classList.add('dragging');
        itemEl.style.top = top + "px";

        // move dragged element to end
        ul.removeChild(itemEl);
        ul.appendChild(itemEl);
      }
    }
    dragHandle.addEventListener('mousedown', pointerDown);

    props.children = [
      render(item, obj),
      el('.buttons', buttons),
    ];
    var itemEl = el('li.' + kind, props);
    return itemEl;
  });

  var newButton;
  if (kind === 'sprite') {
    newButton = el('.sprite.sprite-new', {
      text: "＋ new sprite",
      on_click: function() {
        var sprite = Project.newSprite();
        var name = "turtle";
        var number = 2;
        var p = App.project();
        while (p._spriteNames().indexOf(name) !== -1) {
          name = "turtle" + (number++);
        }
        sprite.objName.assign(name);

        Oops(function() {
          App.project().sprites.push(sprite);
          App.project().children.push(sprite);
        });

        App.active.assign(sprite);
      },
    });
  } else if (kind === 'costume' && obj._isStage) {
    var colorInput;
    newButton = el('.costume.costume-new', {
      on_click: function(e) {
        if (e.target === colorInput) return;

        var name = colorInput.value.slice(1);

        var canvas = el('canvas', {
          width: 480,
          height: 360,
        });
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = colorInput.value;
        ctx.fillRect(0, 0, 480, 360);
        var base64 = canvas.toDataURL('image/png').split(',')[1];
        var binary = atob(base64);
        var ab = Format.binaryToArrayBuffer(binary);

        var costume = Project.newCostume(name, 'png', ab);

        Oops(function() {
          obj.costumes.push(costume);
          obj.currentCostumeIndex.assign(obj.costumes().indexOf(costume));
        });
      },
      children: [
        el('span', "＋ new backdrop"),
        colorInput = el('input', {
          type: 'color',
          value: "#FBF0E3",
        }),
      ],
    });
  } else {
    newButton = el('.' + kind + '.drag-here', "drag here to import");
  }
  if (kind !== 'sound') {
    itemEls = itemEls.compute(function(els) {
      return els.concat([newButton]);
    });
  } else {
    itemEls = itemEls.compute(function(els) {
      if (!els.length) els = [el('.sound.drag-here', "no sounds here")]
      return els;
    });
  }


  // drop to rearrange
  var dragging = null;
  var itemHeight = { sprite: 25, costume: 83, sound: 64 }[kind];

  function pointerMove(e) {
    if (!dragging) return;
    if (kind !== 'sprite' && App.active() !== obj) return;

    var clientY = e.clientY || dragging.lastClientY;
    dragging.lastClientY = clientY;

    var mouseY = clientY - windowTop(ul) + ul.parentNode.scrollTop;
    if (mouseY === dragging.lastMouseY) return;
    dragging.lastMouseY = mouseY;

    var top = mouseY + dragging.offsetY;
    top = Math.max(0, top);
    dragging.el.style.top = top + "px";

    // work out position
    top -= 4;
    var itemIndex = top / itemHeight;
    itemIndex = Math.round(itemIndex);
    itemIndex = Math.min(itemIndex, displayItems().length - 1);
    if (kind === 'sprite' && itemIndex < 1) itemIndex = 1;

    // move placeholder if necessary
    if (itemIndex !== dragging.index) {
      var placeholder = dragging.placeholder;
      ul.removeChild(placeholder);
      var itemEl = ul.children[itemIndex];
      if (itemEl) {
        ul.insertBefore(placeholder, itemEl);
      } else {
        ul.appendChild(placeholder);
      }
      dragging.index = itemIndex;
    }
  }
  window.addEventListener('mousemove', function(e) {
    pointerMove(e);
    e.preventDefault();
  });
  doNext(function() {
    ul.parentNode.addEventListener('wheel', pointerMove);
  });

  function dragTick() {
    if (!dragging) return;
    if (!dragging.lastMouseY) return;
    var SPEED = 0.08;

    // hold at edge to auto-scroll
    var mouseViewportY = dragging.lastClientY - windowTop(ul);
    dragging.scrollSpeed *= 0.8;
    if (mouseViewportY < 0) {
      dragging.scrollSpeed -= SPEED;
    } else if (mouseViewportY > ul.parentNode.offsetHeight) {
      dragging.scrollSpeed += SPEED;
    } else {
      // slow down
      dragging.scrollSpeed *= 0.1;
    }

    ul.parentNode.scrollTop += dragging.scrollSpeed * itemHeight;
  }

  function drop() {
    if (!dragging) return;

    var item = dragging.item;
    var oldIndex = items().indexOf(item);
    var newIndex = kind === 'sprite' ? dragging.index - 1 : dragging.index;
    var newItems = items().slice();
    newItems.splice(oldIndex, 1);
    newItems.splice(newIndex, 0, item);
    // get stopDragging to put it back in the right place
    dragging.resetIndex = dragging.index;

    stopDragging();

    // This refreshes the entire pane, so must happen *after* stopDragging
    Oops(function() {
      items.assign(newItems);
    });
  }

  function stopDragging() {
    if (!dragging) return;

    ul.removeChild(dragging.placeholder); // TODO

    ul.removeChild(dragging.el);
    ul.insertBefore(dragging.el, ul.children[dragging.resetIndex]);

    dragging.el.classList.remove('dragging');
    dragging.el.style.top = "";
    clearInterval(dragging.interval);
    dragging = null;
  }
  window.addEventListener('mouseup', drop);


  var ul = el('ul.items', {
    class: 'items-' + kind + 's',
    children: itemEls,
  });

  return ul;
};


/* NamesEditor */

var NamesEditor = function(sprite, kind) {

  var factory = (kind === 'variable' ? Project.newVariable : Project.newList);
  var addText = sprite._isStage ? "＋ for all sprites" : "＋ for this sprite";
  var names = sprite[kind + 's'];

  var variableList = names.map(function(variable) {
    return el('li', el('p', ko(function() {
        var input = el('input', {
          bind_value: variable._name,
          placeholder: "my "+kind,

          on_focus: function() { variable._isEditing.assign(true); },
          on_blur:  function() { variable._isEditing.assign(false); },

          on_keydown: function(e) {
            if (Host.handleUndoKeys(e)) return;

            Oops(function() {
              if (e.metaKey || e.ctrlKey || e.altKey) return;

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
            }.bind(this));
          },
        });

        variable._isEditing.subscribe(function(value) {
          if (value) { input.focus(); } else { input.blur(); }
        }, false);

        return input;
      })
    ));
  });

  return el('', [
    el('h2', kind[0].toUpperCase() + kind.slice(1) + " names"),
    el('ul.reporters', {
      class: kind,
      children: variableList,
    }),
    el('p.new a.new-variable', {
      text: addText,
      on_click: function() {
        Oops(function() {
          var newVar = factory('');
          names.push(newVar);
          newVar._isEditing.assign(true);
        });
      },
    }),
  ]);

};


/* ScriptsEditor */

function removeUndoKeys(keyMap) {
  var keyMap = copyKeyMap(keyMap);
  delete keyMap['Cmd-Y'];
  delete keyMap['Cmd-Z'];
  delete keyMap['Shift-Cmd-Z'];
  delete keyMap['Ctrl-Y'];
  delete keyMap['Ctrl-Z'];
  return keyMap;
}

var cmOptions = {
  value: "",
  mode: 'tosh',

  indentUnit: 3,
  smartIndent: true,
  tabSize: 3,
  indentWithTabs: true,

  lineWrapping: true,
  dragDrop: false,
  cursorScrollMargin: 80,

  lineNumbers: true,
  // TODO show errors
  //gutters: ['CodeMirror-linenumbers', 'errors'],

  cursorHeight: 1,

  undoDepth: NaN,

  scratchVariables: [],
  scratchLists: [],
  scratchDefinitions: [],

  keyMap: removeUndoKeys(CodeMirror.keyMap.default),
};

var ScriptsEditor = function(sprite, project) {
  this.sprite = sprite;
  this.project = project;
  this.el = el('.editor');
  this.cm = CodeMirror(this.el, cmOptions);

  var code = Compiler.generate(sprite.scripts);
  this.cm.setValue(code);
  this.needsCompile = ko(false);
  this.hasErrors = ko(false);

  this.cm.clearHistory();
  assert(this.cm.getHistory().done.length === 0);
  this.cmUndoSize = 0;
  this.undoing = false;

  // send options to CM, so initial highlight is correct
  this.repaint();

  // repaint when variable/list names change
  var _this = this;
  this.sprite.variables.map(function(variable) {
    variable._name.subscribe(function() {
      _this.debounceRepaint();
    });
  });
  this.sprite.lists.map(function(list) {
    list._name.subscribe(function() {
      _this.debounceRepaint();
    });
  });

  this.cm.on('change', this.onChange.bind(this));
};

ScriptsEditor.prototype.fixLayout = function(offset) {
  this.cm.setSize(NaN, this.el.clientHeight);
};

ScriptsEditor.prototype.compile = function() {
  if (!this.needsCompile()) return this.hasErrors();

  // TODO do a separate compile, rather than re-highlighting
  if (this.repaintTimeout) {
    this.repaint();
  }

  var finalState = this.cm.getStateAfter(this.cm.getDoc().size, true);
  function compileLine(b) {
    if (!b) return b;
    if (b.info) {
      return [b.info.selector].concat((b.args || []).map(compileLine));
    } else {
      if (b.value) return b.value;
      return b;
    }
  }

  this.cm.clearGutter('errors');
  var lines = finalState.lines.slice();
  try {
    var scripts = Compiler.compile(lines);
  } catch (e) {
    console.log(e);
    var line = finalState.lines.length - lines.length + 1;
    var marker = el('div.error', { style: 'color: #822;'}, "●")
    this.cm.setGutterMarker(line, 'errors', marker);

    this.needsCompile.assign(false);
    this.hasErrors.assign(true);
    return true; // has errors
  }

  this.needsCompile.assign(false);
  this.hasErrors.assign(false);
  this.sprite.scripts = scripts;
  return false;
};

ScriptsEditor.prototype.repaint = function() {
  var _this = this;
  function getNames(kind) {
    var names = _this.sprite[kind]();
    if (!_this.sprite._isStage) {
      // include global var/list names
      names = names.concat(_this.project[kind]());
    }
    return names;
  }

  this.cm.setOption('scratchVariables', getNames('variables'));
  this.cm.setOption('scratchLists', getNames('lists'));
  this.cm.setOption('scratchDefinitions', this.definitions);

  // force re-highlight --slow!
  this.cm.setOption('mode', 'tosh');

  clearTimeout(this.repaintTimeout);
  this.repaintTimeout = null;
};

ScriptsEditor.prototype.debounceRepaint = function() {
  if (this.repaintTimeout) {
    clearTimeout(this.repaintTimeout);
  }
  this.repaintTimeout = setTimeout(this.repaint.bind(this), 1000);
};

ScriptsEditor.prototype.checkDefinitions = function() {
  var contents = this.cm.getValue();
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
    var define = results[0].process();
    definitions.push(define);
  });

  var oldDefinitions = this.definitions;
  if (JSON.stringify(oldDefinitions) !== JSON.stringify(definitions)) {
    this.definitions = definitions;
    this.debounceRepaint();
  }
};

ScriptsEditor.prototype.activated = function() {
  doNext(function() {
    this.fixLayout();
    this.cm.focus();
    this.cm.refresh();

    this.debounceRepaint();
  }.bind(this));
};

ScriptsEditor.prototype.undo = function() {
  this.undoing = true;
  this.cm.undo();
  this.undoing = false;
  this.cmUndoSize = this.cm.historySize().undo;

  App.active.assign(this.sprite);
};

ScriptsEditor.prototype.redo = function() {
  this.undoing = true;
  this.cm.redo();
  this.undoing = false;
  this.cmUndoSize = this.cm.historySize().undo;

  App.active.assign(this.sprite);
};

ScriptsEditor.prototype.onChange = function(cm, change) {
  // set dirty
  this.needsCompile.assign(true);
  App.needsCompile.assign(true);

  // analyse affected lines
  var lines = [];
  for (var i=change.from.line; i<=change.to.line; i++) {
    lines.push(this.cm.getLine(i));
  }
  lines = lines.concat(change.removed);
  lines = lines.concat(change.text);
  this.linesChanged(lines);

  // check undo state
  if (!this.undoing) {
    // TODO. We assume that every CM history operation will emit 'change'
    var historySize = this.cm.historySize();
    // nb. historySize appears to exclude selection operations, which is good
    if (historySize.undo !== this.cmUndoSize) {
      // assume every 'change' event create at most one undo operation
      assert(historySize.undo === this.cmUndoSize + 1)
      var op = new Oops.CustomOperation(this.undo.bind(this),
                                        this.redo.bind(this));
      Oops.insert(op);
      this.cmUndoSize++;
    }
    assert(this.cmUndoSize === historySize.undo);
  }
};

ScriptsEditor.prototype.linesChanged = function(lines) {
  for (var i=0; i<lines.length; i++) {
    var line = lines[i];
    if (/^define /.test(line)) {
      this.checkDefinitions();
      return;
    }
  }
};

/*****************************************************************************/

var Settings = function(defaults) {
  this.key = 'toshSettings';
  this.settings = {};
  this._autoSave = false;
  this.update(defaults);
  this.update(this.load());
  this._autoSave = true;
};

Settings.prototype.get = function(name, defaultValue) {
  if (!this.settings.hasOwnProperty(name)) {
    var observable = ko(defaultValue);
    // nb. Careful not to save while loading defaults!
    observable.subscribe(this.save.bind(this), this._autoSave);
    this.settings[name] = observable;
  }
  this[name] = this.settings[name];
  return this.settings[name];
};

Settings.prototype.save = function() {
  var data = Project.copyForSave(this.settings);
  window.localStorage[this.key] = JSON.stringify(data);
};

Settings.prototype.load = function() {
  var encoded = window.localStorage[this.key] || "";
  if (!encoded) return;
  try {
    var data = JSON.parse(encoded);
  } catch(e) {
    console.log("Couldn't parse settings", e);
    return;
  }
  if (!data) return;
  if (typeof data !== 'object') return;
  return data;
};

Settings.prototype.update = function(data) {
  data = data || {};
  Object.keys(data).forEach(function(name) {
    var value = data[name];
    this.get(name, value).assign(value);
  }, this);
};


var Container = function(project, active) {
  active.assign(project.sprites()[0]);

  this.project = project;
  this.active = active;

  this.activeScriptable = ko();
  this.onSwitchSprite = this.switchSprite.bind(this);
  this.active.subscribe(this.onSwitchSprite);

  this.el = el('.container', [
    el('.switcher', ListEditor(project, 'sprite', active)),
    el('.active', this.activeScriptable.compute(function(scriptable) {
      return scriptable ? scriptable.el : "";
    })),
  ]);
};

Container.prototype.switchSprite = function(s) {
  assert(this.project === App.project());

  var scriptable = s._scriptable = s._scriptable
                                || new Scriptable(s, this.project);

  if (this.activeScriptable()) this.activeScriptable().deactivated();
  this.activeScriptable.assign(scriptable);
  scriptable.activated();
};

Container.prototype.destroy = function() {
  this.active.unsubscribe(this.onSwitchSprite);
};


var App = new (function() {

  this.tab = ko('data');

  this.project = ko(Project.new());
  this.active = ko();

  this.needsSave = ko(false);
  this.needsCompile = ko(false);

  this.stage = null;
  this.needsPreview = ko(false);

  this.settings = new Settings({
    smallStage: false,
  });
  this.smallStage = this.settings.smallStage;
  this.isFullScreen = ko(false);

})();

App.onOops = function() {
  App.needsSave.assign(true);
  App.needsPreview.assign(true);
};

App.save = function() {
  // refresh CM editors
  if (App.compile()) return;

  // make project format
  var zip = Project.save(App.project());

  // no longer dirty!
  App.needsSave.assign(false);
  return zip;
};

/* compile each ScriptsEditor */
App.compile = function() {
  var project = App.project();
  var scriptables = [project].concat(project.sprites());
  var hasErrors = false;
  scriptables.forEach(function(s) {
    if (s._scriptable) {
      hasErrors = hasErrors || s._scriptable.scriptsEditor.compile();
    }
  });
  App.needsCompile.assign(false); // no longer dirty
  return hasErrors;
};

/* send project to phosphorus */
App.preview = function(start) {
  // refresh CM editors
  if (App.compile()) return;

  if (App.stage) {
    App.stage.pause();
    App.stage.stopAll();
    window.oldStages = (window.oldStages || []).concat([App.stage]); // DEBUG
    App.stage = null;
  }

  // make project format
  var zip = Project.save(App.project());

  // TODO send phosphorus the zip object, to avoid generation
  var request = P.IO.loadSB2File(zip.generate({ type: 'blob' }));
  //var request = P.IO.loadSB2ProjectZip(zip);

  P.player.showProgress(request, function(stage) {
    App.stage = stage;

    [stage].concat(stage.children).forEach(function(s) {
      if (s.isStage) {
        s._tosh = App.project();
      } else if (s.isSprite) {
        s._tosh = App.project().sprites()[s.indexInLibrary];
      }
    });

    updateStageZoom();
    if (start) {
      stage.focus();
      stage.triggerGreenFlag();
    }
  });

  // no longer dirty
  App.needsPreview.assign(false);
};

/* preview when green flag clicked, if needed */
App.preFlagClick = function() {
  if (App.needsPreview()) {
    App.preview(true);
    return true; // tell phosphorus not to start project
  }
};

/* drop media file on window */
App.fileDropped = function(f) {
  var parts = f.name.split('.');
  var ext = parts.pop();
  var fileName = parts.join('.');
  if (ext === 'png' || ext === 'jpg' || ext == 'jpeg' || ext === 'svg') {
    var reader = new FileReader;
    reader.onloadend = function() {
      var ab = reader.result;
      var costume = Project.newCostume(fileName, ext, ab);
      // TODO resize bitmaps to be less than 480x360
      // TODO ensure unique names
      Oops(function() {
        App.active().costumes.push(costume);
      });
      App.tab.assign('costumes');
    };
    reader.readAsArrayBuffer(f);
  }
  // TODO sounds
};


// build scriptable pane when switching sprites

var wrap = document.querySelector('#wrap');
var container = null;
App.project.subscribe(function(project) {
  if (container) {
    wrap.removeChild(container.el);
    container.destroy();
  }
  container = new Container(project, App.active); // will assign App.active
  wrap.appendChild(container.el);
});


// preview project (but stopped!) when first loaded

App.project.subscribe(function(project) {
  App.preview(false);
});


// transition to small stage when window is too small

var smallStageBtn = document.querySelector('.small-stage');
smallStageBtn.addEventListener('click', App.smallStage.toggle);

var MIN_WIDTH = 1000;
var MIN_HEIGHT = 508;
var windowTooSmall = windowSize.compute(function(size) {
  return (size.width < MIN_WIDTH || size.height < MIN_HEIGHT);
});
windowTooSmall.subscribe(function(tooSmall) {
  if (tooSmall) App.smallStage.assign(true);
  if (tooSmall) {
    smallStageBtn.classList.add('disabled');
  } else {
    smallStageBtn.classList.remove('disabled');
  }
});


// careful not to show transition when window first loads

function cancelTransitions() {
  document.body.classList.add('no-transition');
  doNext(function() {
    document.body.classList.remove('no-transition');

    // if first load, we can now show the app
    wrap.classList.add('visible');
  });
}
cancelTransitions();

App.smallStage.subscribe(function(isSmall) {
  if (!isSmall && windowTooSmall()) {
    App.smallStage.assign(true);
    return;
  }
  if (isSmall) {
    document.body.classList.add('ss');
  } else {
    document.body.classList.remove('ss');
  }
});


// keep track of whether phosphorus is fullscreen

App.fullScreenClick = function() {
  App.isFullScreen.assign(document.documentElement.classList.contains('fs'));
};


// scale phosphorus to small stage

function updateStageZoom() {
  if (App.isFullScreen()) return;

  var stage = App.stage;
  if (!stage) return;
  stage.setZoom(App.smallStage() ? 0.5 : 1);
  if (!stage.isRunning) {
    stage.draw();
  }
}
App.smallStage.subscribe(updateStageZoom);
App.isFullScreen.subscribe(updateStageZoom);
// TODO make phosphorus player not handle resize
window.addEventListener('resize', updateStageZoom);

// careful not to animate player size when coming out of fullscreen!

App.isFullScreen.subscribe(cancelTransitions);


// resize CM when its container changes size

function fixActiveScriptsEditor() {
  // if window is resized while fullscreen, CM gets upset
  if (App.isFullScreen()) return;
  App.active()._scriptable.scriptsEditor.fixLayout();
}
windowSize.subscribe(fixActiveScriptsEditor);
App.isFullScreen.subscribe(fixActiveScriptsEditor);

/*****************************************************************************/

Host.onAppLoad();

