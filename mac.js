var Host = {};

Host.isMac = true;

Host._call = function(obj) {
  var func = Host[obj.name];
  var value = func.call(null, obj.argument);
  return JSON.stringify({ result: value });
}

Host.load = function(assetList) {
  if (!assetList) return;

  var zip = new JSZip();
  assetList.forEach(function(asset) {
    zip.file(asset.name, atob(asset.base64));
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

Host.runProject = function() {
  // TODO simulate 'cmd+enter' keypress
};
Host.stopProject = function() {
  // TODO simulate 'esc' keypress
};

Host.validateMenuItem = function(name) {
  return true; // TODO
  // runProject:
  // stopProject:
};


// drag in assets

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

