var Earley = (function() {
  'use strict';


  function stringify(symbol) {
    var value = symbol.toString ? symbol.toString() : symbol;
    return JSON.stringify(value || symbol);
  }



  var Rule = function(name, symbols, process) {
    if (typeof process !== "function") {
      throw new Error("Rule for " + JSON.stringify(name)
                    + " has no process function");
    }
    symbols.forEach(function(s) {
      if (s === undefined) {
        throw new Error("Rule for " + JSON.stringify(name)
                      + " has invalid symbol: " + JSON.stringify(s));
      }
    });
    this.name = name;
    this.symbols = symbols; // Array of nonterminals and/or
                            // objects with match() method
    this.process = process;
  };

  Rule.prototype.toString = function(position) {
    var r = this.name + " →";
    for (var i=0; i<this.symbols.length; i++) {
      if (i === position) r += " •";
      var symbol = this.symbols[i];
      r += " " + (typeof symbol === "string" ? symbol : stringify(symbol));
      // TODO c -> [object Object]
    }
    if (i === position) r += " •";
    return r;
  };



  var Item = function(rule, origin, position, node, predictedBy, edits) {
    this.rule = rule;
    this.origin = origin;
    this.position = position || 0;
    this.isFinished = (this.position === this.rule.symbols.length);
    if (!this.isFinished) this.expect = this.rule.symbols[this.position];
    this.node = node || [];
    this.predictedBy = predictedBy || [];
    this.edits = edits || 0;
  };

  Item.prototype.toString = function() {
    return this.rule.toString(this.position);
  };

  Item.prototype.next = function(value) {
    // consume one token or nonterminal
    return new Item(this.rule, this.origin, this.position + 1, this.node.concat([value]), this.predictedBy, this.edits);
  };



  var Grammar = function(rules, undefinedRules) {
    this.toplevel = rules.length ? rules[0].name : undefined; // TODO "start"
    this.rules = [];
    this.rulesByName = {};
    this.undefinedRulesSet = {};

    var myself = this;
    (rules || []).forEach(function(rule) {
      myself.addRule(rule);
    });
    (undefinedRules || []).forEach(function(ruleName) {
      myself.undefinedRulesSet[ruleName] = true;
    });
  };

  Grammar.prototype.addRule = function(rule) {
    if (!this.rulesByName.hasOwnProperty(rule.name)) {
      this.rulesByName[rule.name] = [];
    }
    this.rulesByName[rule.name].push(rule);
    this.rules.push(rule);
  };

  Grammar.prototype.copy = function() {
    var copy = new Grammar([], Object.keys(this.undefinedRulesSet));
    copy.toplevel = this.toplevel;
    copy.rules = this.rules.slice();

    var myself = this;
    Object.keys(this.rulesByName).forEach(function(name) {
      copy.rulesByName[name] = myself.rulesByName[name].slice();
    });
    return copy;
  };

  /*
   * Return a copy of the grammar, reversing the symbols of each rule.
   * The result is cached, so copy it before modifying it.
   */
  Grammar.prototype.reverse = function() {
    if (!this._reversed) {
      var rules = this.rules.map(function(r) {
        var symbols = r.symbols.slice();
        symbols.reverse();
        var rule = new Rule(r.name, symbols, r.process);
        rule._original = r;
        return rule;
      });
      var undefinedRules = Object.keys(this.undefinedRulesSet)
      this._reversed = new Grammar(rules, undefinedRules);
    }
    return this._reversed;
  };


  var Parser = function(grammar) {
    this.grammar = grammar;
    this.tokens = [];
    this.table = [];
  };

  Parser.prototype._predict = function(name, origin, item, column) {
    var rules = this.grammar.rulesByName[name];
    if (!rules) {
      if (!this.grammar.undefinedRulesSet[name]) {
        var m = ("No rule named " + JSON.stringify(name)
               + " required by " + JSON.stringify(item.rule.name));
        var err = new Error(m);
        err.rule = item.rule;
        throw err;
      };
      return [];
    }

    var predictedItems = [];
    for (var i=0; i<rules.length; i++) {
      predictedItems.push(new Item(rules[i], origin));
    }
    return predictedItems;
  };

  Parser.prototype._complete = function(item) {
    var results = [];
    for (var i=0; i<item.predictedBy.length; i++) {
      results.push(item.predictedBy[i].next(item));
    }
    return results;
  };
  
  Parser.prototype.parse = function(tokens) {
    var table = this.table;
    var resume = null;
    if (table.length) {
      assert(this.table.length <= this.tokens.length + 1);
      var maxIndex = Math.min(tokens.length, this.table.length - 1);
      for (resume=0; resume < maxIndex; resume++) {
        if (!this.tokens[resume].isEqual(tokens[resume])) {
          break;
        }
      }
      this.table.splice(resume + 1);
    }
    this.tokens = tokens;

    //if (resume !== null) console.log("Resuming from " + resume);

    var grammar = this.grammar;
    var column;
    if (resume === null) {
      assert(!table.length);
      column = this._predict(this.grammar.toplevel, 0, null);
      table.push(column)
    } else if (resume < tokens.length) {
      // resume: create new column by advancing states which match the new token
      this.index = resume;
      var token = tokens[resume];
      column = table[resume];
      var newColumn = [];
      for (var j=0; j<column.length; j++) {
        var item = column[j];
        if (!item.isFinished) {
          if (typeof item.expect !== "string") {
            // advance: consume token
            if (item.expect.match(token)) {
              newColumn.push(item.next(resume));
            }
          }
        }
      }
      if (!newColumn.length) {
        var err = this._makeError(
            "Found " + JSON.stringify(token.value) + " at " + index + ".");
        err.index = index;
        err.found = tokens[resume];
        throw err;
      }
      table.push(newColumn);
      column = newColumn;
      resume++;
    } else {
      // resume completed parse: do nothing
      column = table[table.length - 1];
      resume++;
    }

    for (var index = resume || 0; index <= tokens.length; index++) {
      this.index = index;

      var token = tokens[index];
      var newColumn = [];
      var predictedRules = {};

      for (var j=0; j<column.length; j++) {
        var item = column[j];
        if (!item.isFinished) {
          // non-terminal
          if (typeof item.expect === "string") {
            // predict: add component items
            if (!predictedRules[item.expect]) {
              var predictedItems = this._predict(item.expect, index, item);
              [].push.apply(column, predictedItems);
              predictedRules[item.expect] = predictedItems;
            } else {
              predictedItems = predictedRules[item.expect];
            }
            for (var k=0; k<predictedItems.length; k++) {
              predictedItems[k].predictedBy.push(item);
            }
          // terminal
          } else if (index < tokens.length) {
            // advance: consume token
            if (item.expect.match(token)) {
              newColumn.push(item.next(index));
            }
          }
        // complete: progress earlier items
        } else {
          [].push.apply(column, this._complete(item));
        }
      }

      if (index < tokens.length) {
        if (!newColumn.length) {
          var err = this._makeError(
              "Found " + JSON.stringify(token.value) + " at " + index + ".");
          err.index = index;
          err.found = tokens[index];
          throw err;
        }
        table.push(newColumn);
        column = newColumn;
      }
    }

    var results = column.filter(function(item) {
      return (item.origin === 0 && item.isFinished && item.rule.name == this.grammar.toplevel);
    }, this);
    if (!results.length) {
      throw this._makeError("Incomplete input.");
    }
    return results.map(function(item) {
      return new Result(item, tokens);
    });
  };

  Parser.prototype._makeError = function(message) {
    var column = this.table[this.index];

    var expected = [];
    var ruleNames = [];
    column.forEach(function(item) {
      if (item.isFinished) return;
      if (!(typeof item.expect === "string")) {
        expected.push(stringify(item.expect));
      } else {
        if (ruleNames.indexOf(item.expect) === -1) ruleNames.push(item.expect);
      }
    }, this);

    ruleNames = ruleNames.filter(function(ruleNameToFilter) {
      for (var i=0; i<ruleNames.length; i++) {
        var name = ruleNames[i];
        var rules = this.grammar.rulesByName[name] || [];
        for (var j=0; j<rules.length; j++) {
          var rule = rules[j];
          if (rule.symbols.length !== 1) continue;
          var symbol = rule.symbols[0];
          if (typeof symbol !== "string") continue;
          if (symbol == ruleNameToFilter) return false;
        }
      }
      return true;
    }, this);
    expected = expected.concat(ruleNames);

    if (expected.length === 1) {
      message += " Expected: " + expected[0];
    } else if (expected.length) {
      message += " Expected one of: " + expected.join(", ");
    } else {
      message += " Expected end of input.";
    }
    var err = new Error(message);
    err.expected = expected;
    err._table = this.table;
    return err;
  };



  var Result = function(item, tokens) {
    this.item = item;
    this.tokens = tokens;
  };

  Result.prototype.process = function() {
    var tokens = this.tokens;

    function process(item) {
      var children = [];
      for (var i=0; i<item.node.length; i++) {
        var child = item.node[i];
        if (child.node) { // Item
          child = process(child);
        } else { // Token index
          child = tokens[child];
        }
        children.push(child);
      }
      return item.rule.process.apply(item.rule, children);
    }

    if (!this._ast) {
      this._ast = process(this.item);
    }
    return this._ast;
  };

  Result.prototype.pretty = function() {
    var tokens = this.tokens;

    function pretty(item) {
      var children = [item.rule.name];
      for (var i=0; i<item.node.length; i++) {
        var child = item.node[i];
        if (child.node) { // Item
          child = pretty(child);
        } else { // Token index
          child = JSON.stringify(tokens[child].value);
        }
        children.push(child);
      }
      return "(" + children.join(" ") + ")";
    }

    return pretty(this.item);
  };


  var Completer = function(grammar, maxEdits) {
    this.leftParser = new Parser(grammar, maxEdits);
    this.rightParser = new Parser(grammar.reverse(), maxEdits);
  };

  Completer.cursorToken = {
    kind: "cursor",
    value: "_CURSOR_",
    isEqual: function(other) {
      return other === this;
    },
  };

  Completer.prototype.parse = function(tokens) {
    return this.leftParser.parse(tokens);
  };

  Completer.prototype.complete = function(tokens, cursor) {
    var left = tokens.slice(0, cursor);
    left.push(Completer.cursorToken);

    var right = tokens.slice(cursor);
    right.reverse();
    right.push(Completer.cursorToken);

    var leftColumn;
    var rightColumn;
    try {
      this.leftParser.parse(left); assert(false);
    } catch (e) {
      if (e.found !== Completer.cursorToken) {
        return; // Error before we reached cursor
      }
      leftColumn = e._table[e._table.length - 1];
    }
    try {
      this.rightParser.parse(right); assert(false);
    } catch (e) {
      if (e.found !== Completer.cursorToken) {
        return; // Error before we reached cursor
      }
      rightColumn = e._table[e._table.length - 1];
    }

    var completions = [];

    for (var i=0; i<leftColumn.length; i++) {
      for (var j=0; j<rightColumn.length; j++) {
        var l = leftColumn[i];
        var r = rightColumn[j];
        if (l.rule === r.rule._original 
          ){

          var symbols = l.rule.symbols;
          var li = l.position,
              ri = symbols.length - r.position;
          var completion = symbols.slice(li, ri);
          var options = [completion];

          options.forEach(function(option) {
            completions.push({
              start: l.origin,
              pre: symbols.slice(0, li),
              completion: option,
              post: symbols.slice(ri),
              end: tokens.length - r.origin,
              rule: l.rule,
              item: l,
            });
          });
        }
      }
    }

    function pretty(symbol) {
      return (typeof symbol === "string" ? symbol : stringify(symbol));
    }

    // console.log("Completions table:");
    // console.table(completions.map(function(s) {
    //   var info = s.rule.process._info;
    //   return {
    //     start: s.start,
    //     pre: s.pre.map(pretty).join(" "),
    //     completion: s.completion.map(pretty).join(" "),
    //     post: s.post.map(pretty).join(" "),
    //     end: s.end,
    //     selector: info ? info.selector : null,
    //     name: s.rule.name,
    //   };
    // }));

    return completions;
  };



  return {
    Rule: Rule,
    Grammar: Grammar,
    Parser: Parser,
    Completer: Completer,
  };

}());

function tc(text) {
  var pipeIndex = text.indexOf("|");
  if (pipeIndex === -1) pipeIndex = text.length;
  var beforeTokens = Language.tokenize(text.slice(0, pipeIndex));
  var afterTokens = Language.tokenize(text.slice(pipeIndex + 1));
  var tokens = beforeTokens.concat(afterTokens);
  var completer = new Earley.Completer(Language.grammar);
  return completer.complete(tokens, beforeTokens.length);
}
