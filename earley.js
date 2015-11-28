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
    this.definedAt = new Error().stack.split("\n")[3].trim();
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



  var Item = function(rule, origin, position, node) {
    this.rule = rule;
    this.origin = origin;
    this.position = position || 0;
    this.isFinished = (this.position === this.rule.symbols.length);
    var node = node || [];
    if (this.isFinished) {
      node = this.rule.process.apply(this.rule, node);
    }
    this.node = node;
  };

  Item.prototype.toString = function() {
    return this.rule.toString(this.position);
  };

  Item.prototype.next = function(value) {
    // consume one token or nonterminal
    var node = this.node.slice();
    node.push(value);
    return new Item(this.rule, this.origin, this.position + 1, node);
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



  function earleyParse(grammar, table, tokens) {
  }


  var Parser = function(grammar) {
    this.grammar = grammar;
    this.tokens = [];
    this.table = [];
  };

  Parser.prototype._predict = function(name, origin, item) {
    var rules = this.grammar.rulesByName[name];
    if (!rules) {
      if (!this.grammar.undefinedRulesSet[name]) {
        var m = ("No rule named " + JSON.stringify(name)
               + " required by " + JSON.stringify(item.rule.name)
               + " defined " + item.rule.definedAt);
        var err = new Error(m);
        err.rule = item.rule;
        throw err;
      };
      return [];
    }

    return rules.map(function(rule) {
      return new Item(rule, origin);
    });
  };

  Parser.prototype._complete = function(item) {
    var oldColumn = this.table[item.origin];
    var results = [];
    for (var i=0; i<oldColumn.length; i++) {
      var other = oldColumn[i];
      var expect = other.rule.symbols[other.position];
      if (expect === item.rule.name) {
        results.push(other.next(item.node));
      }
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
          var expect = item.rule.symbols[item.position];
          if (typeof expect !== "string") {
            // advance: consume token
            if (expect.match(token)) {
              newColumn.push(item.next(token));
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
          var expect = item.rule.symbols[item.position];
          // predict: add component items
          if (typeof expect === "string") {
            if (!predictedRules[expect]) {
              [].push.apply(column, this._predict(expect, index, item));
              predictedRules[expect] = true;
            }
          // advance: consume token
          } else if (index < tokens.length) {
            if (expect.match(token)) {
              newColumn.push(item.next(token));
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

    var results = [];
    column.forEach(function(s) {
      if (s.origin === 0 && s.isFinished && s.rule.name == this.grammar.toplevel) {
        results.push(s.node);
      }
    }, this);

    if (results.length) {
      return results;
    } else {
      throw this._makeError("Incomplete input.");
    }
  };

  Parser.prototype._makeError = function(message) {
    var column = this.table[this.index];

    var expected = [];
    var ruleNames = [];
    column.forEach(function(item) {
      if (item.isFinished) return;
      var expect = item.rule.symbols[item.position];
      if (!(typeof expect === "string")) {
        expected.push(stringify(expect));
      } else {
        if (ruleNames.indexOf(expect) === -1) ruleNames.push(expect);
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



  var Completer = function(grammar) {
    this.leftParser = new Parser(grammar);
    this.rightParser = new Parser(grammar.reverse());
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
            });
          });
        }
      }
    }

    function pretty(symbol) {
      return (typeof symbol === "string" ? symbol : stringify(symbol));
    }

    console.log("Completions table:");
    console.table(completions.map(function(s) {
      var info = s.rule.process._info;
      return {
        start: s.start,
        pre: s.pre.map(pretty).join(" "),
        completion: s.completion.map(pretty).join(" "),
        post: s.post.map(pretty).join(" "),
        end: s.end,
        selector: info ? info.selector : null,
        name: s.rule.name,
      };
    }));

    // cases it fails:
    //
    //    pick random | to 10 to 10       [sort of!]
    //
    //    repeat | < 3
    //

    // TODO, in language.js:
    //
    // Inspect completion.
    //
    // If the completion is a rule `s` or `m_effect`, treat it as completing an
    // input.
    //
    // If the completion contains symbols, like: `x to _`
    //                                           `_ and wait` or
    // then treat it as completing a block.
    //
    // That way, we can get a sensible experience.
    //
    // Yay! :D

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
