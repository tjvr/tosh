var Oops = (function() {

  // how to undo events that koel emits

  var actions = {
    assign: function(newValue, oldValue) {
      this.assign(oldValue);
    },
    changed: function(newValue, oldValue) {
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

  var Operation = function(events, after) {
    this.events = events;
    this.after = after;
  };
  Operation.prototype.undoAndReverse = function() {
    var events = this.events.slice();
    events.reverse();

    var reversed = Oops._watch(function() {
      Oops.undoing = true;

      for (var i=0; i<events.length; i++) {
        var action = events[i];
        var func = actions[action.name];
        if (!func) throw action;
        func.apply(action.target, action.args);
      }

      Oops.undoing = false;
    });

    if (this.after) this.after();
    reversed.after = this.after;

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

  Oops.undoing = false;

  /* run a function and log each observable event */
  Oops._watch = function(func) {
    assert(!Oops.undoing);

    // save active sprite & tab
    var wasActive = App.active();
    var wasTab = App.tab();
    var after = function() {
      App.active.assign(wasActive);
      App.tab.assign(wasTab);
    };

    var events = [];
    ko.watch(func, function(observable, operation, args) {
      // ignore computeds & UI scope
      if (ko.isComputed(observable)) return;
      if (observable === App.active || observable === App.tab) {
        after = null; // probably a "replace project" operation
      }

      // save the event that was emitted
      events.push({
        target: observable,
        name: operation,
        args: args.map(copyForStore),
      });
    });

    if (!events.length) return;
    return new Operation(events, after);
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
    if (!Oops.undoStack.length) return;
    var op = Oops.undoStack.pop();
    var reversed = op.undoAndReverse();
    Oops.redoStack.push(reversed);

    // refresh undo/redo state
    Host.onOops();
  };

  Oops.redo = function() {
    if (!Oops.redoStack.length) return;
    var op = Oops.redoStack.pop();
    var reversed = op.undoAndReverse();
    Oops.undoStack.push(reversed);

    // refresh undo/redo state
    Host.onOops();
  };

  Oops.insert = function(op) {
    if (!op) return;

    // save so we can undo it
    Oops.undoStack.push(op);

    // clear redo stack
    Oops.redoStack = [];

    // refresh undo/redo state
    Host.onOops();
  };

  Oops.canUndo = function() {
    return Oops.undoStack.length;
  };
  Oops.canRedo = function() {
    return Oops.redoStack.length;
  };

  Oops.reset = function() {
    Oops.undoStack = [];
    Oops.redoStack = [];
    Host.onOops();
  };


  Oops.CustomOperation = CustomOperation;
  return Oops;

})();
