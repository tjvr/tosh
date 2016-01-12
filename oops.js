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
  Operation.prototype.undoAndReverse = function() {
    var events = this.events.slice();
    events.reverse();

    var reversed = Oops._watch(function() {
      for (var i=0; i<events.length; i++) {
        var action = events[i];
        var func = actions[action.name];
        if (!func) throw action;
        func.apply(action.target, action.args);
      }
    });
    return reversed;
  };


  // CM operations are special

  var CustomOperation = function(undo, redo) {
    this.undo = undo;
    this.redo = redo;
  };
  CustomOperation.prototype.reverse = function() {
    return new CustomOperation(this.redo, this.undo);
  };
  CustomOperation.prototype.undoAndReverse = function() {
    this.undo();
    return this.reverse();
  };


  // the undo manager

  var Oops = function(func) {
    // run the action and log all changes
    var op = Oops._watch(func);

    // push onto undo stack
    Oops.insert(op);
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
    var reversed = op.undoAndReverse();
    Oops.redoStack.push(reversed);
    return true;
  };

  Oops.redo = function() {
    if (!Oops.redoStack.length) return false;
    var op = Oops.redoStack.pop();
    var reversed = op.undoAndReverse();
    Oops.undoStack.push(reversed);
    return true;
  };

  Oops.insert = function(op) {
    // save so we can undo it
    Oops.undoStack.push(op);

    // clear redo stack
    Oops.redoStack = [];
  };


  Oops.CustomOperation = CustomOperation;
  return Oops;

})();
