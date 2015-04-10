
function $(selector) {
  return [].slice.apply(document.querySelectorAll(selector));
}
function el(tagName, className, textContent, children) {
  if (className === undefined) { className = tagName; tagName = 'div'; }
  var result = document.createElement(tagName);
  if (className) result.className = className;
  if (textContent) result.textContent = textContent;
  (children || []).forEach(function(child) {
    if (typeof child == "string") {
      child = document.createTextNode(child);
    }
    result.appendChild(child);
  });
  return result;
}
function removeChildren(el) {
  el.innerHTML = ''; // TODO the more efficient version
}
function setClassBool(el, className, value) {
  if (value) {
    el.classList.add(className);
  } else {
    el.classList.remove(className);
  }
  return value;
}
function get(key, object) {
    return object[key];
};
function log(x) { console.log(x); }
function error(x) { console.log(new Error(x)); }




var Editor = function(preview, textarea) {
  this.preview = preview;
  this.textarea = textarea;

  var myself = this;
  this.textarea.addEventListener('input', function(e) { myself.onChange(e); });
  this.textarea.addEventListener('keydown', function(e) { myself.onKey(e); });
  // this.textarea.addEventListener('paste', onChange);

  this.textarea.value = window.localStorage['editor-content'] || '';
  this.onChange();

  this.textarea.focus();
};

Editor.prototype.onKey = function(event) {
  var start = this.textarea.selectionStart;
  var end = this.textarea.selectionEnd;
  var value = this.textarea.value;
  var oldValue = value;
  var before, selection, after;
  readSelection();

  function readSelection() {
    before = value.slice(0, start);
    selection = value.slice(start, end);
    after = value.slice(end);
  }

  function writeSelection() {
    value = before + selection + after;
    start = before.length;
    end = before.length + selection.length;
  }

  function expandSelection() {
    start = before.lastIndexOf('\n') + 1;
    if (!/\n$/.test(selection)) {
      end += after.indexOf('\n');
    }
    readSelection();
  }

  var action = '';
  switch (event.keyCode) {
    case 9: // tab
      if (start === end) {
        action = 'tab';
      } else {
        action = event.shiftKey ? 'dedent' : 'indent';
      }
      break;
  }
  if (!action) return;

  event.preventDefault();

  if (action === 'tab') {
    var lineStart = before.slice(before.lastIndexOf('\n') + 1);
    if (/^\t*$/.test(lineStart)) {
      value = before + '\t' + after;
      start++; end++;
    }
  } else if (action === 'indent' || action === 'dedent') {
    expandSelection();
    selection = '\n' + selection;
    if (action === 'indent') {
      selection = selection.replace(/\n/g, '\n\t');
    } else {
      selection = selection.replace(/\n\t/g, '\n');
    }
    selection = selection.slice(1); // remove leading '\n'
    writeSelection();
  }


  if (value !== oldValue) {
    this.textarea.value = value;
    this.textarea.setSelectionRange(start, end);
    var textEvent = document.createEvent('TextEvent');
    textEvent.initTextEvent('textInput', true, true, null, selection);
    this.textarea.dispatchEvent(textEvent);
    this.textarea.setSelectionRange(start, end);
    // this.onChange();
  }
};

Editor.prototype.onChange = function(event) {
  var value = this.textarea.value;
  window.localStorage['editor-content'] = value;

  var result = parse(value);

  var myself = this;
  removeChildren(this.preview);
  result.forEach(function(lineTokens) {
    var children = lineTokens.map(function(token) {
      var className = token.kind + " " + token.category;
      var text = token.text || '\u200c';
      if (token.display) {
        var span = el('span', className, null, [
          el('span', 'display', token.display),
          el('span', 'hidden', text),
        ]);
      } else {
        var span = el('span', className, text);
      }
      if (token.color) span.style.color = token.color;
      return span;
    });

    if (!children.length) children = ['\u200c'];

    myself.preview.appendChild(el('div', 'line', null, children));
  });

  this.textarea.style.width = this.preview.offsetWidth + 'px';
  this.textarea.style.height = this.preview.offsetHeight + 'px';
};

var editorPreview = $('#editor-preview')[0];
var editorTextarea = $('#editor-textarea')[0];
var editor = new Editor(editorPreview, editorTextarea);

$('#editor')[0].addEventListener('click', function() {
    editorTextarea.focus();
});
