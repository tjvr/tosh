
var Host = {};
Host.isMac = true;

Host._call = function(obj) {
  var func = Host[obj.name];
  var value = func.call(null, obj.argument);
  return JSON.stringify({ result: value });
}


// load & save

Host.load = function(assetList) {
  if (!assetList) return;

  var zip = new JSZip();
  assetList.forEach(function(asset) {
    var ab = Format.binaryToArrayBuffer(atob(asset.base64));
    zip.file(asset.name, ab);
  });

  App.project.assign(Project.load(zip));
};

Host.save = function() {
  var zip = App.save();

  return Object.keys(zip.files).map(function(name) {
    return {
      name: name,
      base64: btoa(zip.file(name).asBinary()),
    };
  });
};


// undo & redo

Host.undo = Oops.undo;
Host.redo = Oops.redo;
Host.canUndo = Oops.canUndo;
Host.canRedo = Oops.canRedo;

Host.onOops = function() {
  App.onOops();
}
Host.handleUndoKeys = function(e) {};


// run & stop menu items

Host.runProject = function() {
  App.preview(true);
};
Host.stopProject = function() {
  // simulate ⎋ ESC
  if (App.stage) App.stage.pause();
  App.active()._scriptable.scriptsEditor.cm.focus();
  // TODO update pause button
};

Host.validateMenuItem = function(name) {
  switch (name) {
    case 'runProject:':  return true;
    case 'stopProject:': return (App.stage && App.stage.isRunning);
  }
};


// drag in assets
// TODO highlight areas etc
// TODO move this to app?

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

  App.fileDropped(f);
});


// do nothing

Host.onAppLoad = function() {};

