var Earley = (function() {

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
      throw makeError("Incomplete input.");
    }

    function makeError(message) {
      var expected = [];
      var ruleNames = [];
      column.forEach(function(state) {
        if (state.isComplete) return;
        var expect = state.rule.symbols[state.position];
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

      err._table = table;

      return err;
    }

  };



  var Completer = function(grammar) {
    this.beforeParser = new Parser(grammar);
    this.afterParser = new Parser(grammar.reverse());
  };

  Completer.prototype.complete = function(tokens, cursorIndex, ruleNames) {
    function tok(token) {
      var r = token.isPartial ? "*" : "";
      return JSON.stringify(token.value + r) || (token.kind + r);
    }
    function pretty(symbol) {
      return (typeof symbol === "string" ? symbol : stringify(symbol));
    }

    console.log(tokens.slice(0, cursorIndex).map(tok)
                .concat(["|"])
                .concat(tokens.slice(cursorIndex).map(tok)).join(" "));

    var cursorToken = { kind: "cursor" };
    var before = tokens.slice(0, cursorIndex);
    before.push(cursorToken);

    var after = tokens.slice(cursorIndex);
    after.reverse();
    after.push(cursorToken);

    var beforeTable;
    var afterTable;
    try {
      this.beforeParser.parse(before); assert(false);
    } catch (e) {
      if (e.found !== cursorToken) {
        // There was an error before finding the cursor...
        return;
      }
      beforeTable = e._table;
    }
    try {
      this.afterParser.parse(after); assert(false);
    } catch (e) { 
      if (e.found !== cursorToken) {
        // There was an error before finding the cursor...
        return;
      }
      afterTable = e._table;  
    }

    var leftColumn = beforeTable[beforeTable.length - 1];
    var rightColumn = afterTable[afterTable.length  - 1];

    var byName = {};

    for (var i=0; i<leftColumn.length; i++) {
      var l = leftColumn[i];
      var name = l.rule.name;
      if (!byName.hasOwnProperty(name)) byName[name] = [];
      byName[name].push(l.rule.symbols);
    }

    var completions = [];

    for (var i=0; i<leftColumn.length; i++) {
      for (var j=0; j<rightColumn.length; j++) {
        var l = leftColumn[i];
        var r = rightColumn[j];
        if (l.rule === r.rule._original 
            && (l.position > 0 || r.position > 0)
          ){

          // TODO: compare ancestors list

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

    console.table(completions.map(function(s) {
      var info = s.rule.process._info;
      return {
        start: s.start,
        pre: s.pre.map(pretty).join(" "),
        completion: s.completion.map(pretty).join(" "),
        post: s.post.map(pretty).join(" "),
        end: s.end,
        rule: info ? info.selector : null,
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
  var completer = new Earley.Completer(g);
  return completer.complete(tokens, beforeTokens.length);
}
