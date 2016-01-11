var Host = {};

Host.isMac = true;

Host.load = function(assetList) {
  var zip = new JSZip();

  console.log(assetList);

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

