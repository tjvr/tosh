var Format = (function() {

  var STAGE_SVG = '<svg width="480px" height="360px"><path fill="#ffffff" d="M 0 0 L 480 0 L 480 360 L 0 360 Z" /></svg>';

  var TURTLE_SVG = '<svg width="25px" height="20px"><path style="fill:#007de0;stroke:#033042;stroke-width:1;stroke-linejoin:round;" d="M 0,0 20,8 0,16 6,8 Z" /></svg>';

  /***************************************************************************/

  var backdrop = {
    name: 'backdrop1',
    // baseLayerID: 2,
    // baseLayerMD5: 'b61b1077b0ea1931abee9dbbfa7903ff.png',
    ext: 'svg', // !
    file: STAGE_SVG, // !
    bitmapResolution: 1,
    rotationCenterX: 240,
    rotationCenterY: 180,
  };

  var turtle = {
    name: 'turtle',
    // baseLayerID: 1,
    // baseLayerMD5: '4c8c8b562674f070b5a87b91d58d6e39.svg',
    ext: 'svg', // !
    file: TURTLE_SVG, // !
    bitmapResolution: 1,
    rotationCenterX: 8,
    rotationCenterY: 8,
  };


  var Project = {};

  Project.new = function() {
    var sprite = Project.newSprite();

    var project = {
      objName: 'Stage',
      _isStage: true,

      children: [sprite],
      sprites: [sprite], // !

      scripts: [],
      scriptComments: [],

      variables: ko([]),
      lists: ko([]),

      costumes: ko([backdrop]),
      currentCostumeIndex: 0,
      sounds: ko([]),

      penLayerMD5: '5c81a336fab8be57adc039a8a2b33ca9.png',
      penLayerID: 0,
      tempoBPM: 60,
      videoAlpha: 0.5,
      info: {
        videoOn: false,
        spriteCount: 1, // goes stale
        scriptCount: 0, // goes stale
      },
    };

    return project;
  };

  Project.newSprite = function() {
    var sprite = {
      objName: 'turtle',
      indexInLibrary: 1, // goes stale

      scripts: [],
      scriptComments: [],

      variables: ko([]),
      lists: ko([]),

      costumes: ko([turtle]),
      currentCostumeIndex: 0,
      sounds: ko([]),

      scratchX: 0,
      scratchY: 0,
      scale: 1,
      direction: 90,
      rotationStyle: 'normal',
      isDraggable: false,
      visible: true,
      spriteInfo: {},
    };
    return sprite;
  };

  Project.newVariable = function(name) {
    var name = ko(name || "");
    return {
      name: name,
      _name: name,
      value: 0,
      isPersistent: false,
      _isEditing: ko(false),
    };
  };

  Project.newList = function(name) {
    var name = ko(name || "");
    return {
      listName: name,
      _name: name,
      contents: [],
      isPersistent: false,
      x: 5,
      y: 5,
      width: 102,
      height: 202,
      visible: false,
      _isEditing: ko(false),
    };
  };


  /* load */

  Project.load = function(zip) {
    var p = P.IO.parseJSONish(zip.file('project.json').asText());

    // build sprites array
    p.sprites = p.children.filter(function(x) { return !!x.objName; });
    p.sprites.sort(function(a, b) {
      return a.indexInLibrary < b.indexInLibrary ? -1 :
             a.indexInLibrary > b.indexInLibrary ? +1 : 0;
    });

    p._isStage = true;

    [p].concat(p.sprites).forEach(function(s) {
      // ensure properties are present
      s.scripts = s.scripts || [];
      s.scriptComments = s.scriptComments || [];

      s.variables = ko(s.variables || []);
      s.lists = ko(s.lists || []);

      // koel-ify variables & lists
      s.variables().forEach(function(variable) {
        variable._name = variable.name = ko(variable.name);
        variable._isEditing = ko(false);
      });
      s.lists().forEach(function(list) {
        list._name = list.listName = ko(list.listName);
        list._isEditing = ko(false);
      });

      // sort scripts
      s.scripts.sort(function(a, b) {
        var ax = a[0], ay = a[1], bx = b[0], by = b[1];
        return ay > by ? +1 : ay < by ? -1
             : ax > bx ? +1 : ax < bx ? -1 : 0;
      });

      // load costumes
      s.costumes = ko(s.costumes || []);
      s.costumes().forEach(function(costume) {
        var ext = costume.baseLayerMD5.split('.').pop(),
            root = costume.baseLayerID + '.';

        // load file
        var f = zip.file(root + ext);
        if (!f) { ext = 'png'; f = zip.file(root + ext); }
        if (!f) { ext = 'jpg'; f = zip.file(root + ext); }
        if (!f) { ext = 'svg'; f = zip.file(root + ext); }
        costume.file = f.asArrayBuffer();
        costume.ext = ext;

        // make an <image> element
        var image = new Image;
        image.src = 'data:image/' + (ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + btoa(f.asBinary());
        costume.$image = image;

        // fixup `name` property
        costume.name = costume.costumeName;
        delete costume.baseLayerID;
        delete costume.baseLayerMD5;
        delete costume.costumeName;
      });

      // load sounds
      s.sounds = ko(s.sounds || []);
      s.sounds().forEach(function(sound) {
        var ext = sound.md5.split('.').pop() || 'wav',
            filename = sound.soundID + '.' + ext;

        // load file
        var f = zip.file(filename);
        sound.file = f.asArrayBuffer();
        sound.ext = ext;

        // fixup `name` property
        sound.name = sound.soundName;
        delete sound.soundID;
        delete sound.md5;
      });
    });

    return p;
  };

  /* save */

  Project.copyForSave = function(p) {
    function copy(v) {
      if (!v) return v;
      if (ko.isObservable(v)) {
        v = v(); // specific to this
      }
      if (v.constructor === Array) {
        return v.map(copy);
      } else if (v.constructor === Object) {
        var d = {};
        Object.keys(v).forEach(function(k) {
          if (/^_/.test(k)) return;
          d[k] = copy(v[k]);
        });
        return d;
      }
      return v;
    }

    return copy(p);
  };

  Project.save = function(p) {
    // refresh stale things
    p.sprites.forEach(function(s, index) {
      s.indexInLibrary = index;
    });

    // count sprites & scripts
    p.info.spriteCount = p.sprites.length;
    p.info.scriptCount = sum([p].concat(p.sprites).map(function(obj) {
      return obj.scripts.length;
    }));

    // copy everything
    var p = Project.copyForSave(p);
    var zip = new JSZip();

    // throw away `sprites` array
    delete p.sprites;

    // save assets
    var highestCostumeId = 0;
    var highestSoundId = 0;
    [p].concat(p.children).forEach(function(s) {

      if (!s.objName) return;

      // save costumes
      s.costumes.forEach(function(costume) {
        // fixup `name` property
        costume.costumeName = costume.name;
        delete costume.name;

        // store file
        costume.baseLayerID = highestCostumeId++;
        costume.baseLayerMD5 = '';
        var filename = costume.baseLayerID + '.' + costume.ext;
        zip.file(filename, costume.file);
        delete costume.ext;
        delete costume.file;
      });

      // save costumes
      s.sounds.forEach(function(sound) {
        // fixup `name` property
        sound.soundName = sound.name;
        delete sound.name;

        // store file
        sound.soundID = highestSoundId++;
        sound.md5 = '';
        var filename = sound.soundID + '.' + sound.ext;
        zip.file(filename, sound.file);
        delete sound.ext;
        delete sound.file;
      });

    });

    // store json
    zip.file('project.json', JSON.stringify(p));

    return zip;
  };


  /***************************************************************************/

  /* undo + observables */

  var Action = function(op, d) {
    this.op = op;
    this.undo = d.undo;
    this.redo = d.redo;
  };

  var Oops = function() {
    this.undoStack = [];
    this.redoStack = [];

    this.actions = {};
  };

  Oops.prototype._doMaybeCombine = function(op, args, combine) {
    var info = this.actions[op];

    // .init() may modify args
    args = info.init ? info.init.apply(null, args) : args;
    if (!args) return false;

    // make action
    var _this = this;
    var action = new Action(op, {
      undo: function() {
        if (info.begin) info.begin.apply(info, args);
        info.undo.apply(info, args);
        if (info.end) info.end.apply(info, args);
        _this.trigger(null, op);
      },
      redo: function() {
        if (info.begin) info.begin.apply(info, args);
        info.redo.apply(info, args);
        if (info.end) info.end.apply(info, args);
        _this.trigger(null, op);
      },
    });
    action.redo();

    // combine with previous action of same kind
    if (combine) {
      var last = undoStack.pop();
      if (last.op !== op) {
        undoStack.push(last); // put it back
      }
    }

    // save so we can undo it
    this.undoStack.push(action);

    // clear redo stack
    this.redoStack = [];

    return true;
  };

  Oops.prototype.do = function(op /*, args */) {
    var args = [].slice.call(arguments, 1);
    return this._doMaybeCombine(op, args, false);
  };

  Oops.prototype.doCombine = function(op /*, args */) {
    var args = [].slice.call(arguments, 1);
    return this._doMaybeCombine(op, args, true);
  };

  Oops.prototype.undo = function() {
    if (!this.undoStack.length) return false;
    var action = this.undoStack.pop();
    action.undo();
    this.redoStack.push(action);
    return true;
  };

  Oops.prototype.redo = function() {
    if (!this.redoStack.length) return false;
    var action = this.redoStack.pop();
    action.redo();
    this.undoStack.push(action);
    return true;
  };



  return {
    Project: Project,
    Oops: Oops,
  };

}());

