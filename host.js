
var Host = {};

Host.isMac = /Mac/i.test(navigator.userAgent);

Host.save = function() {
  var zip = App.exportProject();
  var blob = zip.generate({ type: 'blob' });

  // TODO save file properly

  var a = el('a', {
    style: 'display: none;',
    download: App.project()._fileName + '.sb2',
    href: URL.createObjectURL(blob),
  }, " ");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

Host.load = function() {
};

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

      // TODO fix undo
      // TODO fix project storage

      App.project.assign(project);
    };
    reader.readAsArrayBuffer(f);
  }
});

window.onbeforeunload = function(e) {
  if (App.isDirty()) {
    return "You have unsaved changes!";
  }
};

// TODO toolbar

