var ko = (function() {

  function assertFunction(v) { if (!isFunction(v)) throw "Not a function: " + v; }
  function isFunction(v) { return typeof v === 'function' && !(v instanceof Observable); }
  function isObservable(v) { return v instanceof Observable; }

  /* observable */

  var readCallback;

  var Observable = function(initial) {
    this._id = Observable.highestId++;
    this._value = initial;
    this._subscribers = [];
    this._listeners = {};
    // for computeds
    this._dependencies = [];
    this._isChanging = false;

    var OK = function() {
      if (arguments.length) throw "No arguments allowed! Did you mean .assign()";
      if (readCallback) readCallback(OK);
      return OK.peek();
    };

    delete OK.length;
    OK.__proto__ = this;
    for (key in this) {
      if (typeof this[key] === 'function' && this[key].bind) {
        OK[key] = this[key].bind(OK);
      } else if (OK[key] !== this[key]) {
        // extend, if setting proto doesn't work
        OK[key] = this[key];
      }
    }
    return OK;
  };
  Observable.highestId = 0;

  Observable.prototype.peek = function() {
    return this._value;
  };

  Observable.prototype.assign = function(newValue) {
    var oldValue = this._value;
    if (oldValue === newValue) return;

    var success = false;
    try {
      this._value = newValue;

      if (this._isChanging) return;
      this._isChanging = true;
      this.emit('assign', newValue);
      success = true;
    } finally {
      this._isChanging = false;
      if (!success) {
        this._value = oldValue;
        this.emit('assign', oldValue);
      }
    }
  };

  Observable.prototype.emit = function(name /* args */) {
    var _this = this;
    var args = [].slice.call(arguments, 1);
    var listeners = this._listeners[name] || [];
    for (var i=0; i<listeners.length; i++) {
      var cb = listeners[i];
      cb.apply(_this, args);
    }
    this._changed(this._value);
  };

  Observable.prototype._changed = function(newValue) {
    var tmp = readCallback;
    readCallback = null;

    var subscribers = this._subscribers.slice();
    for (var i=0; i<subscribers.length; i++) {
      var s = subscribers[i];
      var cb = s._notify || s;
      cb.call(undefined, newValue);
    }

    readCallback = tmp;
  };

  Observable.prototype.subscribe = function(subscriber, callNow) {
    var callNow = (callNow === undefined) ? true : !!callNow;
    var cb;
    if (typeof subscriber === 'object') {
      for (name in subscriber) {
        assertFunction(subscriber[name]);
        this._listeners[name] = this._listeners[name] || [];
        this._listeners[name].push(subscriber[name]);
      }
      cb = subscriber.assign;
    } else {
      cb = subscriber._notify || subscriber; // Computed or function
      assertFunction(cb);
      this._subscribers.push(subscriber);
    }
    // TODO: what's Knockout's approach to callNow?
    if (callNow && cb) {
      var tmp = readCallback;
      readCallback = null;

      cb.call(undefined, this._value);

      readCallback = tmp;
    }
  };

  Observable.prototype.unsubscribe = function(cb) {
    var index = this._subscribers.indexOf(cb);
    this._subscribers.splice(index, 1); // remove
  };

  Observable.prototype.destroy = function(cb) {
    var _this = this;
    this._subscribers = [];
    this._dependencies.forEach(function(dep) {
      dep.unsubscribe(_this);
    });
    this._dependencies = [];
  }

  Observable.prototype.compute = function(func) {
    assertFunction(func);
    var _this = this;
    return computed(function() {
      return func(_this());
    });
  };

  var observable = function(v) {
    if (v instanceof Observable) return v;
    return new Observable(v);
  };

  /* computed */

  var computed = function(func) {
    assertFunction(func);
    var args = [].slice.call(arguments, 1);

    var result;

    function recompute() {
      var newDependencies = [];
      var tmp = readCallback;
      readCallback = function(dep) {
        if (newDependencies.indexOf(dep) !== -1) return;
        newDependencies.push(dep);
      };

      var value;
      try {
        value = func.apply(undefined, args);
      } finally {
        readCallback = tmp;
      }

      if (result) {
        // Unsubscribe from old dependencies
        var oldDependencies = result._dependencies;
        for (var i=0; i<oldDependencies.length; i++) {
          oldDependencies[i].unsubscribe(result);
        }
      }

      if (!result) {
        // Make sure the observable is initialised with the initial value
        result = ko(value);
        // This makes sure subscribe works. Should never actually be called!
        result._notify = function() { assert(false); }
      }

      // Subscribe new dependencies
      for (var i=0; i<newDependencies.length; i++) {
        newDependencies[i].subscribe(result, false);
      }
      result._dependencies = newDependencies;

      return value;
    }

    // Compute initial value & create observable
    recompute();

    // Computables can't be assigned
    var _assign = result.assign;
    delete result.assign;

    result._isComputing = false;

    result._notify = function() {
      if (this._isComputing) return;
      _assign(recompute());
    }.bind(result);

    return result;
  };

  /* plugins */

  var func = function(v) {
    return (typeof v === 'function') ? computed(v) : observable(v);
  };

  var ko = function(v) {
    if (v instanceof Observable) return v;
    return func(v);
  };
  ko.Observable = Observable;

  ko.observable = observable;
  ko.computed = computed;

  ko.subscribe = function(v, obj) {
    if (v instanceof Observable) {
      v.subscribe(obj);
    } else {
      if (typeof obj === "function") {
        obj(v);
      } else {
        obj.assign(v);
      }
    }
  };

  ko.isObservable = isObservable;
  ko.isFunction = isFunction;

  ko.plugin = function(cb) {
    var _super = func;
    func = function(v) {
      return cb(v, _super);
    };
  };
  return ko;

}());

/*****************************************************************************/

/*
 * Boolean plugin
 */

ko.plugin(function(value, _super) {
  var observable = _super(value);

  if (typeof value === 'boolean') {
    observable.negate = function() {
      return this.compute(function(value) {
        return !value;
      });
    }.bind(observable);

    observable.toggle = function() {
      this.assign(!this());
    }.bind(observable);
  }

  return observable;
});

/*****************************************************************************/

/*
 * Array plugin
 */
ko.plugin(function(value, _super) {
  var computed = ko.computed;

  var events = {
    insert: function(index, item)  { this.splice(index, 0, item); },
    replace: function(index, item) {
      if (this[index] === item) return;
      return this.splice(index, 1, item);
    },
    remove: function(index)        { return this.splice(index, 1); },
  };

  var actions = {
    push: function(item) { return this.insert(this().length, item); },
    pop: function()      { return this.remove(this().length - 1); },
    shift: function()  { return this.remove(0); },
  };

  var deriveds = {
    map: function(cb) {
      var resultObservables = [];

      function initial(array) {
        resultObservables = array.map(function(inputItem) {
          var observable = computed(cb, inputItem);
          subscribeTo(observable);
          return observable;
        });

        return resultObservables.map(function(observable) {
          return observable();
        });
      }

      var derived = derivedArray();

      function subscribeTo(observable) {
        observable.subscribe(function(outputItem) {
          // index of observable might change after we bind to it!
          var index = resultObservables.indexOf(observable);
          derived._replace(index, outputItem);
        }, false);
      }

      this.subscribe({
        assign: function(array) {
          resultObservables.forEach(function(observable) {
            observable.destroy();
          });
          derived._assign(initial(array));
        },
        replace: function(index, inputItem) {
          resultObservables[index].destroy();
          var observable = computed(cb, inputItem);
          resultObservables[index] = observable;
          var outputItem = observable();
          derived._replace(index, outputItem);
          subscribeTo(observable);
        },
        insert: function(index, inputItem) {
          var observable = computed(cb, inputItem);
          resultObservables.splice(index, 0, observable);
          subscribeTo(observable);
          var outputItem = observable();
          derived._insert(index, outputItem);
        },
        remove: function(index) {
          resultObservables[index].destroy();
          resultObservables.splice(index, 1);
          derived._remove(index);
        },
      });

      derived.destroy = function() {
        resultObservables.forEach(function(observable) {
          observable.destroy();
        });
        ko.g
      }

      return derived;
    },
    filter: function(cb) {
      var resultObservables = [];

      function initial(array) {
        resultObservables = array.map(function(item) {
          var observable = computed(cb, item);
          subscribeTo(observable);
          return observable;
        });

        return array.filter(function(item, inputIndex) {
          var observable = resultObservables[inputIndex];
          return observable();
        });
      }

      var derived = derivedArray();

      this.subscribe({
        assign: function(array) {
          resultObservables.forEach(function(observable) {
            observable.destroy();
          });
          derived.assign(initial(array));
        },
        replace: function(inputIndex, item) {
          var previous = resultObservables[inputIndex]
          var wasIncluded = previous();
          previous.destroy();
          var observable = computed(cb, item);
          resultObservables[inputIndex] = observable;
          var include = observable();
          considerItem(wasIncluded, include, inputIndex, item);
          subscribeTo(observable);
        },
        insert: function(inputIndex, item) {
          var observable = computed(cb, item);
          resultObservables.splice(inputIndex, 0, observable);
          subscribeTo(observable);
          var include = observable();
          if (include) {
            var outputIndex = getOutputIndex(inputIndex);
            derived._insert(outputIndex, item);
          }
        },
        remove: function(inputIndex) {
          var previous = resultObservables[inputIndex];
          var wasIncluded = previous();
          previous.destroy();
          resultObservables.splice(inputIndex, 1);
          if (wasIncluded) {
            var outputIndex = getOutputIndex(inputIndex);
            derived._remove(outputIndex);
          }
        },
      });

      var self = this;
      function subscribeTo(observable) {
        observable.subscribe(function(include) {
          var inputIndex = resultObservables.indexOf(observable);
          var array = self();
          var item = array[inputIndex];
          considerItem(!include, include, inputIndex, item);
        }, false);
      }

      function considerItem(wasIncluded, include, inputIndex, item) {
        // index of observable might change after we bind to it!
        var outputIndex = getOutputIndex(inputIndex);
        if (include && wasIncluded) {
          derived._replace(outputIndex, item);
        } else if (include && !wasIncluded) {
          derived._insert(outputIndex, item);
        } else if (!include && wasIncluded) {
          derived._remove(outputIndex);
        }
      }

      function getOutputIndex(inputIndex) {
        return resultObservables.slice(0, inputIndex).filter(function(x) {
          return x();
        }).length;
      }

      derived.destroy = function() {
        resultObservables.forEach(function(observable) {
          observable.destroy();
        });
      };
      return derived;
    },
  };

  function derivedArray() {
    var derived = ko([]);
    for (key in events) {
      derived['_'+key] = derived[key];
      delete derived[key];
    }
    for (key in actions) {
      delete derived[key];
    }
    derived._assign = derived.assign;
    delete derived.assign;
    return derived;
  }

  function makeObservableArray(array) {
    delete array.length;
    array.length = computed(function() {
      return this().length;
    }.bind(array));

    Object.keys(events).forEach(function(key) {
      array[key] = (function() {
        var func = events[key];
        var value = this();
        var args = [].slice.call(arguments);
        var result = func.apply(value, args);
        this.emit.apply(this, [key].concat(args));
        return result;
      }).bind(array);
    });

    Object.keys(actions).forEach(function(key) {
      array[key] = actions[key].bind(array);
    });

    Object.keys(deriveds).forEach(function(key) {
      array[key] = deriveds[key].bind(array);
    });
  };

  var observable = _super(value);
  if (value instanceof Array) {
    makeObservableArray(observable);
  }
  return observable;
});

/*****************************************************************************/

var el = (function() {
  var directProperties = {
    defaultValue: 'defaultValue',
    'for': 'htmlFor',
    html: 'innerHTML',
    text: 'textContent',
    unselectable: 'unselectable',
    value: 'value'
  };

  var booleanProperties = {
    autofocus: 1,
    checked: 1,
    defaultChecked: 1,
    disabled: 1,
    hidden: 1,
    multiple: 1,
    readOnly: 1,
    required: 1,
    selected: 1
  };

  var bindingProperties = {
    value: 1,
    selected: 1,
    checked: 1,
  };

  function bindClass(el, value, extraClasses) {
    ko.subscribe(value, function(value) {
      if (typeof value === "string") value = value.split(/ +/g);
      el.className = ''; // TODO class list properly
      (value || []).concat(extraClasses).forEach(function(v) {
        if (!v) return;
        el.classList.add(v);
      });
    });
  }

  function setProperty(el, key, value) {
    var prop = directProperties[key];
    if (prop) {
      el[prop] = (value == null ? '' : '' + value);
    } else if (booleanProperties[key]) {
      el[key] = !!value;
    } else if (value == null) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, '' + value);
    }
  }

  function getProperty(el, key) {
    var prop = directProperties[key];
    if (prop) {
      return el[prop];
    } else if (booleanProperties[key]) {
      return !!el[key];
    } else {
      return el.getAttribute(key);
    }
  }

  function bindProperty(el, key, value) {
    if (/^on_/.test(key)) {
      key = key.slice('on_'.length);
      el.addEventListener(key, value);
      return;
    }

    if (/^bind_/.test(key)) {
      key = key.slice('bind_'.length);
      if (!ko.isObservable(value)) {
        throw "Can only bind observable";
      } else if (!value.assign) {
        throw "This observable can't be assigned";
      } else if (!bindingProperties[key]) {
        throw "Can't bind property: " + key;
      } else {
        function update() {
          value._value = getProperty(el, key);
          value.emit('changed');
        }
        el.addEventListener('input', update);
        el.addEventListener('change', update);
      }
    }

    ko.subscribe(value, {
      assign: function(value) {
        setProperty(el, key, value);
      },
    });
  };

  return function(selectors, attrs, content) {
    if (ko.isObservable(attrs) ||
        attrs instanceof Array ||
        typeof attrs === 'string' || (attrs && attrs.appendChild)
    ) {
      content = attrs;
      attrs = {};
    }
    attrs = attrs || {};

    var extraClasses = [];

    var topParent;
    var result;
    selectors.split(/ +/g).forEach(function(selector) {
      var parts = selector.split(/([#.])/g);
      var tagName = parts[0] || 'div';
      var el = document.createElement(tagName);

      for (i=1, j=2; j < parts.length; i+=2, j+=2) {
        var value = parts[j];
        if (parts[i] == '#') {
          if (attrs.id) throw "Can't specify id twice";
          el.id = value;
        } else if (parts[i] == '.') {
          extraClasses.push(value);
        }
      }

      if (!topParent) topParent = el;
      if (result) result.appendChild(el);
      result = el;
    });

    var classList = attrs.class;
    delete attrs.class;
    if (attrs.className) {
      if (classList) throw "Can't set class twice";
      classList = attrs.className;
      delete attrs.className;
    }
    if (attrs.classList) {
      throw "Use .class instead";
    }
    bindClass(result, classList, extraClasses);

    for (key in attrs) {
      bindProperty(result, key, attrs[key]);
    }

    if (!content) {
      return topParent;
    }
    var hasContent = (attrs.text || attrs.textContent || attrs.html ||
                      attrs.innerHTML || attrs.innerText);
    if (hasContent) {
      throw "Cannot use both attrs and children to set content";
    }
    content = ko.observable(content || []);

    function makeChild(c) {
      return c && c.appendChild ? c : document.createTextNode(c);
    }

    function refresh(children) {
      if (!(children instanceof Array)) { // String or Element
        children = [children];
      }
      // Array
      while (result.firstChild) {
        result.removeChild(result.lastChild);
      }
      for (var i=0; i<children.length; i++) {
        var child = children[i];
        result.appendChild(makeChild(child));
      }
    }

    content.subscribe({
      assign: refresh,
      insert: function(index, newChild) {
        result.insertBefore(makeChild(newChild), result.children[index]);
      },
      remove: function(index) {
        result.removeChild(result.children[index]);
      },
      replace: function(index, newChild) {
        var oldChild = result.children[index];
        result.insertBefore(makeChild(newChild), oldChild);
        result.removeChild(oldChild);
        // result.replaceChild(makeChild(newChild), result.children[index]);
      },
    });

    return topParent;
  };
}());

