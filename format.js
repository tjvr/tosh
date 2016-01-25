var Format = (function() {

  var STAGE_SVG = "<svg width='480px' height='360px'><path fill='#ffffff' d='M 0 0 L 480 0 L 480 360 L 0 360 Z' /></svg>";

  var TURTLE_SVG = "<svg width='25px' height='20px'><path style='fill:#007de0;stroke:#033042;stroke-width:1;stroke-linejoin:round;' d='M 0,0 20,8 0,16 6,8 Z' /></svg>";

  function arrayBufferToBinary(ab) {
    var binary = '';
    var bytes = new Uint8Array(ab);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode( bytes[ i ] );
    }
    return binary;
  }

  function binaryToArrayBuffer(binary) {
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      var ascii = binary.charCodeAt(i);
      bytes[i] = ascii;
    }
    return bytes.buffer;
  }

  function loadImage(ext, binary) {
    // here, we abuse observables as a sort of Promise.
    // move along now...

    var $image = ko(null);
    if (ext === 'jpg') ext = 'jpeg';
    if (ext === 'svg') {
      var canvas = el('canvas');
      canvg(canvas, binary, {
      renderCallback: function() {
        $image.assign(new Image);
        $image().src = canvas.toDataURL('image/png');
      }});
    } else {
      $image.assign(new Image);
      $image().src = 'data:image/' + ext + ';base64,' + btoa(binary);
    }

    var src = ko(null);
    $image.subscribe(function(image) {
      if (!image) return;
      if (image.src) {
        src.assign(image.src);
      } else {
        image.addEventListener('load', function(e) {
          src.assign(image.src);
        });
      }
    });

    var size = ko(null);
    src.subscribe(function() {
      if (!src) return;
      var image = $image();
      if (!image) return;
      size.assign({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    });

    return {
      $image: $image,
      src: src,
      size: size,
    };
  }

  function audioFromFile(ext, binary) {
    assert(ext === 'wav');
    var audio = new Audio;
    audio.src = 'data:audio/' + ext + ';base64,' + btoa(binary);
    audio.controls = true;
    return audio;
  }

  function getName(o) {
    return o.objName();
  }

  /***************************************************************************/

  var backdropDetails = loadImage('svg', STAGE_SVG);
  var backdrop = {
    name: ko('backdrop1'),
    // baseLayerID: 2,
    // baseLayerMD5: 'b61b1077b0ea1931abee9dbbfa7903ff.png',
    ext: 'svg', // !
    file: STAGE_SVG, // !
    bitmapResolution: 1,
    rotationCenterX: 240,
    rotationCenterY: 180,
    _$image: backdropDetails.$image,
    _src: backdropDetails.src,
    _size: backdropDetails.size,
  };

  var turtleDetails = loadImage('svg', TURTLE_SVG);
  var turtle = {
    name: ko('turtle'),
    // baseLayerID: 1,
    // baseLayerMD5: '4c8c8b562674f070b5a87b91d58d6e39.svg',
    ext: 'svg', // !
    file: TURTLE_SVG, // !
    bitmapResolution: 1,
    rotationCenterX: 8,
    rotationCenterY: 8,
    _$image: turtleDetails.$image,
    _src: turtleDetails.src,
    _size: turtleDetails.size,
  };


  var Project = {};

  Project.new = function() {
    var sprite = Project.newSprite();

    var project = {
      objName: ko('Stage'),
      _isStage: true,
      _hasErrors: ko(false),

      _fileName: '',

      children: ko([sprite]),
      sprites: ko([sprite]), // !

      scripts: [],
      scriptComments: [],

      variables: ko([]),
      lists: ko([]),

      costumes: ko([backdrop]),
      currentCostumeIndex: ko(0),
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

    project._spriteNames = project.sprites.map(getName);

    return project;
  };

  Project.newSprite = function() {
    var sprite = {
      objName: ko('turtle'),
      indexInLibrary: 1, // goes stale
      _hasErrors: ko(false),

      scripts: [],
      scriptComments: [],

      variables: ko([]),
      lists: ko([]),

      costumes: ko([turtle]),
      currentCostumeIndex: ko(0),
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

  Project.newCostume = function(name, ext, ab) {
    var details = loadImage(ext, arrayBufferToBinary(ab));
    var costume = {
      name: ko(name),
      ext: ext,
      file: ab,
      bitmapResolution: 1,
      rotationCenterX: 0,
      rotationCenterY: 0,
      _$image: details.$image,
      _src: details.src,
      _size: details.size,
    };
    details.size.subscribe(function(size) {
      // TODO bitmapResolution ??
      costume.rotationCenterX = size.width / 2;
      costume.rotationCenterY = size.height / 2;
    });
    return costume;
  };

  Project.newSound = function(name, ext, ab) {
    var $sound = audioFromFile(ext, arrayBufferToBinary(ab));
    return {
      name: ko(name),
      ext: ext,
      file: ab,
      // sampleCount: 0, // TODO
      // rate: 0,
      // format: "",
      _$audio: $audio,
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
    p.sprites.forEach(function(s) {
      s.objName = ko(s.objName);
    });
    p.sprites = ko(p.sprites);
    p.children = ko(p.children);

    p._spriteNames = p.sprites.map(getName);

    p._isStage = true;

    var n = 0;

    var scriptableMappings = {};

    var stageSeen = {};
    [p].concat(p.sprites()).forEach(function(s) {
      // ensure properties are present
      s.scripts = s.scripts || [];
      s.scriptComments = s.scriptComments || [];

      s.variables = ko(s.variables || []);
      s.lists = ko(s.lists || []);

      // UI-only properties
      s._hasErrors = ko(false);

      // koel-ify attrs
      s.objName = ko(s.objName);
      s.currentCostumeIndex = ko(s.currentCostumeIndex || 0);

      // sort scripts
      s.scripts.sort(function(a, b) {
        var ax = a[0], ay = a[1], bx = b[0], by = b[1];
        return ay > by ? +1 : ay < by ? -1
             : ax > bx ? +1 : ax < bx ? -1 : 0;
      });

      // koel-ify variables & lists
      s.variables().forEach(function(variable) {
        variable._name = variable.name = ko(variable.name);
        variable._isEditing = ko(false);
      });
      s.lists().forEach(function(list) {
        list._name = list.listName = ko(list.listName);
        list._isEditing = ko(false);
      });

      // TODO create undefined variables & lists
      // if they are referenced from a script somewhere

      // validate variable, list, and parameter names
      var details = {
        variable: {},
        list: {},
        definitions: {},
      };
      var target = s.objName();
      var seen = {};
      if (s === p) {
        target = "_stage_";
        stageSeen = seen;
      }
      s.variables().forEach(function(variable) {
        var name = variable._name();
        var newName = Language.cleanName('variable', name, seen, stageSeen);
        seen[newName] = true;
        details.variable[name] = newName;
        variable._name.assign(newName);
      });
      s.lists().forEach(function(list) {
        var name = list._name();
        var newName = Language.cleanName('list', name, seen, stageSeen);
        seen[newName] = true;
        details.list[name] = newName;
        list._name.assign(newName);
      });
      // TODO definition parameters
      scriptableMappings[target] = details;

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

        // make <image> element
        var details = loadImage(ext, f.asBinary());
        costume._$image = details.$image;
        costume._src = details.src;
        costume._size = details.size;

        // fixup `name` property
        costume.name = ko(costume.costumeName);
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

        // make <audio> element
        sound._$audio = audioFromFile(ext, f.asBinary());

        // fixup `name` property
        sound.name = ko(sound.soundName);
        delete sound.soundID;
        delete sound.md5;
      });
    });


    // automatic variable/list/parameter renaming

    [p].concat(p.sprites()).forEach(function(s) {
      var defaultTarget = s === p ? "_stage_" : s.objName();

      var rename = function(defineSpec, kind, name, target) {
        var target = target || defaultTarget;

        if (name instanceof Array) return name;

        var details = scriptableMappings[target];
        var mapping = details[kind];
        var result;
        if (kind === 'parameter') {
          mapping = mapping[defineSpec];
          if (!mapping) return;
          result = mapping[name];
        } else {
          if (!mapping[name]) {
            details = scriptableMappings["_stage_"];
            mapping = details[kind];
          }
          result = mapping[name];
        }

        if (result !== name) {
          console.log(target + ": " + name + " -> " + result);
        }
        return result;
      };

      var mappingForScript = function(firstBlock) {
        var spec = null;
        if (firstBlock[0] === 'procDef') {
          spec = firstBlock[1];
        }
        return rename.bind(this, spec);
      }

      s.scripts = s.scripts.map(Compiler.renameInScript.bind(this, mappingForScript));
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
      if (v && v.constructor === Array) {
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
    p.sprites().forEach(function(s, index) {
      s.indexInLibrary = index;
    });

    // count sprites & scripts
    p.info.spriteCount = p.sprites().length;
    p.info.scriptCount = sum([p].concat(p.sprites()).map(function(obj) {
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

      // fixup names
      s.variables = fixNameObjects(s.variables);
      s.lists = fixNameObjects(s.lists);

      // TODO set persistent if cloud ☁ in name

    });

    // store json
    zip.file('project.json', JSON.stringify(p));

    return zip;
  };

  function fixNameObjects(objects) {
    var seen = {};
    var result = [];
    for (var i=0; i<objects.length; i++) {
      var obj = objects[i];
      var name = obj.name || obj.listName;
      if (!name) continue;
      if (seen.hasOwnProperty(name)) continue;
      result.push(obj);
      seen[name] = true;
    }
    return result;
  }

  /***************************************************************************/

  return {
    Project: Project,
    binaryToArrayBuffer: binaryToArrayBuffer,
  };

}());
