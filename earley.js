var Earley = (function() {

  function assert(x, message) {
    if (!x) {
      var err = new Error("Assertion failed: " + (message || ''));
      console.log(err.stack);
      throw err;
    }
  }

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

  Rule.highestId = 0;

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



  /* State: a rule with a starting point in the input stream */
  var State = function(rule, origin, position) {
    pos = position || 0;
    this.rule = rule;
    this.origin = origin; // starting point in input stream
    this.position = pos;  // how many rule symbols we've consumed
    this.isComplete = (this.position === this.rule.symbols.length);
    this.node = [];
  };

  State.prototype.toString = function() {
    return this.rule.toString(this.position);
  };

  /* Return state after consuming one token or nonterminal */
  State.prototype.next = function(value) {
    var node = this.node.slice();
    node.push(value);
    var s = new State(this.rule, this.origin, this.position + 1);
    if (s.isComplete) {
      node = this.rule.process.apply(this.rule, node);
    }
    s.node = node;
    return s;
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
      copy.rulesByName[name] = myself.rulesByName[name];
    });
    return copy;
  };



  var Parser = function(grammar) {
    this.grammar = grammar;
  };

  Parser.prototype.parse = function(tokens) {
    var grammar = this.grammar;
    var column = grammar.rulesByName[grammar.toplevel].map(function(rule) {
      return new State(rule, 0);
    }); // state set
    var table = this.table = [column];

    for (var i=0; i<=tokens.length; i++) {
      var token = tokens[i];
      var newColumn = [];
      var predictedRules = {};

      for (var j=0; j<column.length; j++) {
        var state = column[j];
        if (!state.isComplete) {
          var expect = state.rule.symbols[state.position];
          if (typeof expect === "string") {
            // predict: add component states
            if (!predictedRules[expect]) {
              var rules = grammar.rulesByName[expect];
              if (!rules) {
                if (!grammar.undefinedRulesSet[expect]) {
                  var m = ("No rule named " + JSON.stringify(expect)
                         + " required by " + JSON.stringify(state.rule.name)
                         + " defined " + state.rule.definedAt);
                  var err = new Error(m);
                  err.rule = state.rule;
                  throw err;
                };
              } else {
                rules.forEach(function(rule) {
                  column.push(new State(rule, i));
                });
              }
              predictedRules[expect] = true;
            }
          } else if (i < tokens.length) {
            // advance: consume token
            if (expect.match(token)) {
              newColumn.push(state.next(token));
            }
          }
        } else {
          // complete: progress earlier states
          var oldColumn = table[state.origin];
          oldColumn.forEach(function(other) {
            var expect = other.rule.symbols[other.position];
            if (expect === state.rule.name) {
              var newState = other.next(state.node);
              column.push(newState);
            }
          });
        }
      }

      if (i < tokens.length) {
        if (!newColumn.length) {
          var err = makeError(
              "Found " + JSON.stringify(token.value) + ".");
          err.index = i;
          err.found = tokens[i];
          throw err;
        }
        table.push(newColumn);
        column = newColumn;
      }
    }

    var results = [];
    column.forEach(function(s) {
      if (s.origin === 0 && s.isComplete && s.rule.name == grammar.toplevel) {
        results.push(s.node);
      }
    });

    if (results.length) {
      return results;
    } else {
      // There were no complete parses.
      var rules = {};
      column.forEach(function(state) {
        rules[state.rule.name] = true;
      });

      // TODO: invalid, or incomplete?

      throw makeError("Incomplete input.");
    }

    function makeError(message) {
      var expected = [];
      var suggest = [];
      var ruleNames = [];
      column.forEach(function(state) {
        if (state.isComplete) return;
        var expect = state.rule.symbols[state.position];
        if (state.position > 0) suggest.push(expect);
        if (!(typeof expect === "string")) {
          expected.push(stringify(expect));
        } else {
          if (ruleNames.indexOf(expect) === -1) ruleNames.push(expect);
        }
      });

      ruleNames = ruleNames.filter(function(ruleNameToFilter) {
        for (var i=0; i<ruleNames.length; i++) {
          var name = ruleNames[i];
          var rules = grammar.rulesByName[name] || [];
          for (var j=0; j<rules.length; j++) {
            var rule = rules[j];
            if (rule.symbols.length !== 1) continue;
            var symbol = rule.symbols[0];
            if (typeof symbol !== "string") continue;
            if (symbol == ruleNameToFilter) return false;
          }
        }
        return true;
      });
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
      err.suggest = suggest;

      return err;
    }

  };

  return {
    Rule: Rule,
    Grammar: Grammar,
    Parser: Parser,
  };

}());

