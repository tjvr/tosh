
var Host = {};

Host.isMac = /Mac/i.test(navigator.userAgent);


// progress indicators
// TODO actual progress bars/framework

var Indicator = function() {
  var loading = el('.shade', el('.massive', "Loading"));
  document.body.appendChild(loading);

  document.querySelector('#menu').classList.add('shaded');
  document.querySelector('#wrap').classList.add('shaded');

  return {
    clear: function() {
      document.querySelector('#menu').classList.remove('shaded');
      document.querySelector('#wrap').classList.remove('shaded');

      loading.classList.add('shade-fade');
      setTimeout(function() {
        document.body.removeChild(loading);
      }, 1000);
    },
  }
};


// save button uses FileSaver.js

Host.save = function() {
  var indicator = Indicator('Saving');
  try {
    var zip = App.save();
    if (!zip) throw new Error("Couldn't compile project");
  } catch (e) {
    alert("Error saving project: " + e.message || e);
    indicator.clear();
    return;
  }

  // TODO show alert if zip is null
  var blob = zip.generate({ type: 'blob' });
  var fileName = (App.project()._fileName || "tosh") + ".sb2";

  if (!isSafari) {
    saveAs(blob, fileName, true);
  } else {
    var url = "data:application/zip;base64," + zip.generate({ type: 'base64' });
    location.href = url;
  }
  indicator.clear();
};
document.querySelector('#button-save').addEventListener('click', Host.save);


// doesn't seem to work in Safari!

var isSafari = /Version\/[\d\.]+.*Safari/.test(navigator.userAgent);
if (isSafari) {
  if (!localStorage.hasSeenSaveAlert) {
    alert("Saving projects may not be supported by Safari. Please be careful!");
  }
  localStorage.hasSeenSaveAlert = "yes";
}


// load dropped in / opened file

function loadFile(f, indicator) {
  var indicator = indicator || Indicator('Loading');

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

      App.loadProject(project);

      indicator.clear();
    };
    reader.readAsArrayBuffer(f);
    return true;
  }
}

function loadFiles(files, indicator) {
  // if single file, try to load project
  if (files.length === 1) {
    var f = files[0];
    if (!f) return;
    if (loadFile(f, indicator)) return;
  }
  indicator.clear(); // don't need that

  // drag in assets
  App.filesDropped(files);
}


// open button shows file dialog

var loadBtn = document.querySelector('#button-load');
var fileInput = el('input', { type: 'file', });
loadBtn.appendChild(fileInput);

function handleFileSelect(e) {
  var indicator = Indicator('Loading');
  setTimeout(function() {
    loadFiles(e.target.files, indicator);
  }, 200);
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
  loadFiles(e.dataTransfer.files);
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
  e.stopPropagation();
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
        App.runProject();
        e.stopPropagation(); // otherwise CM keeps focus somehow
        break;
      case 83: // save: ⌘S
        e.preventDefault(); // don't accidentally save page
        Host.save();
        // TODO feedback on error
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


// project keybindings

document.querySelector('.player').addEventListener('keydown', function(e) {
  if (!App.stage) return;
  if (/INPUT/i.test(e.target.tagName)) return;
  switch (e.keyCode) {
    case 27: // stop:  ESC
      player.pauseClick({ preventDefault: function(){} });
      App.active()._scriptable.activated();
      break;
    default:
      return;
  }
  e.preventDefault();
}, true);


