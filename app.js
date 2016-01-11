
var Pos = CodeMirror.Pos;

var Project = Format.Project;
var Oops = new Format.Oops;

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

var renderItem = {
  sprite: function(sprite) {
    var costume = sprite.costumes()[sprite.currentCostumeIndex()];
    return el('.details', [
      // el('input.name', { // TODO name editing
      el('.name', sprite.objName),
      // costume._$image, // TODO
    ]);
  },
  costume: function(costume, sprite) {
    return el('.details', [
      el('.thumb', costume._$image),
      el('input.name', {
        bind_value: costume.name,
      }),
      el('.media-number', ko(function() {
        return "#" + (sprite.costumes().indexOf(costume) + 1);
      })),
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
      // TODO undo
      items.remove(items().indexOf(item));
    }

    function editName() {
      var result = prompt("Rename sprite ", item._name());

      // handle cancel
      if (!result) return;

      // TODO ensure unique names
      // TODO undo
      item._name.assign(result);
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

        var mouseY = e.clientY - windowTop(ul);
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

  if (kind === 'sprite') {
    var newButton = el('.sprite.sprite-new', {
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

        // TODO undo
        App.project().sprites.push(sprite);
        App.project().children.push(sprite);

        App.active.assign(sprite);
      },
    });

    itemEls = itemEls.compute(function(els) {
      return els.concat([newButton]);
    });
  }

  // drop to rearrange
  var dragging = null;
  var itemHeight = { sprite: 25, costume: 83, sound: 64 }[kind];

  function pointerMove(e) {
    if (!dragging) return;
    if (kind !== 'sprite' && App.active() !== obj) return;

    var mouseY = e.clientY - windowTop(ul);
    var top = mouseY + dragging.offsetY;
    top = Math.max(0, top);
    dragging.el.style.top = top + "px";

    // Work out position
    top -= 4; // #item-list padding
    var itemIndex = top / itemHeight; // App.dragging.el.offsetHeight);
    itemIndex = Math.round(itemIndex);
    itemIndex = Math.min(itemIndex, displayItems().length - 1);
    if (kind === 'sprite' && itemIndex < 1) itemIndex = 1;

    if (itemIndex !== dragging.index) {
      var placeholder = dragging.placeholder;
      ul.removeChild(placeholder);
      var itemEl = ul.children[itemIndex];
      if (itemEl) {
        console.log(itemEl);
        ul.insertBefore(placeholder, itemEl);
      } else {
        ul.appendChild(placeholder);
      }
      dragging.index = itemIndex;
    }
  }
  window.addEventListener('mousemove', pointerMove);

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
    // TODO undo
    items.assign(newItems);
  }

  function stopDragging() {
    if (!dragging) return;

    ul.removeChild(dragging.placeholder); // TODO

    ul.removeChild(dragging.el);
    ul.insertBefore(dragging.el, ul.children[dragging.resetIndex]);

    dragging.el.classList.remove('dragging');
    dragging.el.style.top = "";
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

  // TODO undo

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
        var newVar = factory('');
        names.push(newVar);
        newVar._isEditing.assign(true);
      },
    }),
  ]);

};


/* ScriptsEditor */

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
  //gutters: ['CodeMirror-linenumbers', 'errors'],

  cursorHeight: 1,

  scratchVariables: [],
  scratchLists: [],
  scratchDefinitions: [],
};

var ScriptsEditor = function(sprite, project) {
  this.sprite = sprite;
  this.project = project;
  this.el = el('.editor');
  this.cm = CodeMirror(this.el, cmOptions);

  var code = Compiler.generate(sprite.scripts);
  this.cm.setValue(code);

  this.repaint();

  // resize CM when its container changes size
  var fixLayout = this.fixLayout.bind(this);
  windowSize.subscribe(fixLayout);
  doNext(fixLayout);

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

  this.cm.on('change', this.codeChange.bind(this));
};

ScriptsEditor.prototype.fixLayout = function(offset) {
  this.cm.setSize(NaN, this.el.clientHeight);
};

ScriptsEditor.prototype.flush = function() {
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
    throw e;
    return;
  }

  this.sprite.scripts = scripts;
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

ScriptsEditor.prototype.activated = function() {
  doNext(function() {
    this.fixLayout();
    this.cm.focus();
    this.cm.refresh();

    this.debounceRepaint();
  }.bind(this));
};

ScriptsEditor.prototype.codeChange = function() {
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
    el('.active', this.activeScriptable.compute(getEl)),
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

  this.isDirty = ko(true); // TODO

  this.project = ko(Project.new());
  this.active = ko();

  this.projectDirty = false;
  this.phosphorusStale = false;

  this.settings = new Settings({
    smallStage: false,
  });
  this.smallStage = this.settings.smallStage;

})();

App.save = function() {

  // TODO compile
  App.active()._scriptable.scriptsEditor.flush(); // DEBUG

  return Project.save(App.project());
};

App.fileDropped = function(f) {
  var parts = f.name.split('.');
  var ext = parts.pop();
  var fileName = parts.join('.');
  if (ext === 'png' || ext === 'jpg' || ext === 'svg') {
    var reader = new FileReader;
    reader.onloadend = function() {
      var ab = reader.result;
      var costume = Project.newCostume(fileName, ext, ab);
      // TODO resize bitmaps to be less than 480x360
      // TODO ensure unique names
      App.active().costumes.push(costume);
      App.tab.assign('costumes');
    };
    reader.readAsArrayBuffer(f);
  }
};

// hook up menu actions

if (document.querySelector('#menu')) {
  document.querySelector('#button-load').addEventListener('click', Host.load);
  document.querySelector('#button-save').addEventListener('click', Host.save);
}

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

// transition to small stage when window is too small

document.querySelector('.small-stage').addEventListener('click', App.smallStage.toggle);

var MIN_WIDTH = 1000;
var MIN_HEIGHT = 508;
var windowTooSmall = windowSize.compute(function(size) {
  return (size.width < MIN_WIDTH || size.height < MIN_HEIGHT);
});
windowTooSmall.subscribe(function(tooSmall) {
  if (tooSmall) App.smallStage.assign(true);
});

// careful not to show transition when window first loads

document.body.classList.add('no-transition');
App.smallStage.subscribe(function(isSmall) {
  if (isSmall) {
    document.body.classList.add('ss');
  } else {
    document.body.classList.remove('ss');
  }
  if (windowTooSmall()) {
    setTimeout(function() { App.smallStage.assign(true); }, 50);
  }
});
doNext(function() {
  document.body.classList.remove('no-transition');
  wrap.classList.add('visible');
});

/*****************************************************************************/

