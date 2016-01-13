
var Host = {};

Host.isMac = /Mac/i.test(navigator.userAgent);


// save button does <a download> trick
// TODO replace with FileSaver js

Host.save = function() {
  var zip = App.save();
  var blob = zip.generate({ type: 'blob' });

  // TODO save file properly

  var a = el('a', {
    style: 'display: none;',
    download: App.project()._fileName + '.sb2',
    href: URL.createObjectURL(blob),
    contents: " ",
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

function loadProjectFile(f) {
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

      Oops(function() {
        App.project.assign(project);
      });
    };
    reader.readAsArrayBuffer(f);
  } else {
    // drag in assets
    App.fileDropped(f);
  }
}
document.querySelector('#button-save').addEventListener('click', Host.save);


// open button shows file dialog

var loadBtn = document.querySelector('#button-load');
var fileInput = el('input', { type: 'file', });
loadBtn.appendChild(fileInput);

function handleFileSelect(e) {
  var f = e.target.files[0];
  if (!f) return;

  loadProjectFile(f);
}
fileInput.addEventListener('change', handleFileSelect, false);


// undo & redo menu items

var canUndo = ko(false);
var canRedo = ko(false);
Host.onOops = function() {
  canUndo.assign(Oops.canUndo());
  canRedo.assign(Oops.canRedo());

  App.onOops();
};

var menu = document.querySelector('#menu');
var undoBtn = el('.menu-button', {
  class: ko(function() { return canUndo() ? "" : "hidden" }),
  on_click: Oops.undo,
  text: "↺",
});
var redoBtn = el('.menu-button', {
  class: ko(function() { return canRedo() ? "" : "hidden" }),
  on_click: Oops.redo,
  text: "↻",
});

var helpBtn = document.querySelector('#button-help');
menu.insertBefore(undoBtn, helpBtn);
menu.insertBefore(redoBtn, helpBtn);


// show project name in menu bar

Host.onAppLoad = function() {
  var projectName = el('.menu-title',
    ko(function() { return App.project()._fileName })
  );
  menu.insertBefore(projectName, helpBtn);
};


// drop file to open
// TODO highlight drop area

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

  loadProjectFile(f);
});


// don't leave if we haven't saved to disk

window.onbeforeunload = function(e) {
  if (App.needsSave()) {
    return "You have unsaved changes!";
  }
};


// undo keybindings may need to be handled inside <inputs> etc
// TODO is this really correct?

Host.handleUndoKeys = function(e) {
  if (e.metaKey && e.ctrlKey) return;
  if (e.altKey) return;

  if (Host.isMac ? e.metaKey : e.ctrlKey) {
    switch (e.keyCode) {
      case 89: // redo: ⌘Y
        Oops.redo();
        break;
      case 90: // undo: ⌘Z
        if (e.shiftKey) { // redo: ⇧⌘Z
          if (!Host.isMac) return;
          Oops.redo();
        } else {
          Oops.undo();
        }
        break;
      default:
        return;
    }
  } else {
    return;
  }
  e.preventDefault();
  return true;
};


// global keybindings
// TODO fix

document.addEventListener('keydown', function(e) {
  // ctrl + cmd not allowed
  if (e.metaKey && e.ctrlKey) return;
  // alt not allowed
  if (e.altKey) return;

  if (Host.handleUndoKeys(e)) return;

  // global C-bindings -> cmd on mac, ctrl otherwise
  if (Host.isMac ? e.metaKey : e.ctrlKey) {
    switch (e.keyCode) {
      case 13: // run:  ⌘↩
        App.preview(true);
        break;
      case 83: // save: ⌘S
        Host.save();
        break;
      default: return;
    }
  } else {
    // plain, document-only bindings
    if (e.target !== document.body) return;
    if (e.metaKey || e.ctrlKey) return;
    switch (e.keyCode) {
      case 8: // backspace
        break; // disable backspace to go back
      default: return;
    }
  }
  e.preventDefault();
}, true);

