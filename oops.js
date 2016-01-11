var Oops = (function() {

  // how to undo events that koel emits

  var actions = {
    assign: function(newValue, oldValue) {
      this.assign(oldValue);
    },
    remove: function(index, item) {
      if (!this.insert) return;
      this.insert(index, item);
    },
    insert: function(index, item) {
      if (!this.remove) return;
      this.remove(index);
    },
  }


  // a list of events

  var Operation = function(events) {
    this.events = events;
  };
  Operation.prototype.undo = function() {
    var events = this.events.slice();
    events.reverse();
    for (var i=0; i<events.length; i++) {
      var action = events[i];
      var func = actions[action.name];
      if (!func) throw action;
      func.apply(action.target, action.args);
    }
  };


  // the undo manager

  var Oops = function(func) {
    // run the action and log all changes
    var op = Oops._watch(func);

    // save so we can undo it
    Oops.undoStack.push(op);

    // clear redo stack
    Oops.redoStack = [];
  };

  /* run a function and log each observable event */
  Oops._watch = function(func) {
    var events = [];
    ko.watch(func, function(observable, operation, args) {
      events.push({
        target: observable,
        name: operation,
        args: args.map(copyForStore),
      });
    });
    return new Operation(events);
  };

  Oops.undoStack = [];
  Oops.redoStack = [];

  function copyForStore(value) {
    if (ko.isObservable(value)) value = value();
    if (value && value.constructor === Array) value = value.slice();
    return value;
  }

  Oops._reverse = function(operation) {
    var reversed = Oops._watch(Operation.undo);
    return reversed;
  };

  Oops.undo = function() {
    if (!Oops.undoStack.length) return false;
    var op = Oops.undoStack.pop();
    var reversed = Oops._watch(function() {
      op.undo();
    });
    Oops.redoStack.push(reversed);
    console.log('undid');
    return true;
  };

  Oops.redo = function() {
    if (!Oops.redoStack.length) return false;
    var op = Oops.redoStack.pop();
    var reversed = Oops._watch(function() {
      op.undo();
    });
    Oops.undoStack.push(reversed);
    console.log('redid');
    return true;
  };


  return Oops;

})();
