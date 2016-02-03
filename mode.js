CodeMirror.defineMode("tosh", function(cfg, modeCfg) {

  function deepCopy(x) {
    return JSON.parse(JSON.stringify(x));
  }

  var State = function() {
    this.lines = [];
    this.lineTokens = [];
    this.indent = 0;

    var grammar = Language.grammar.copy();
    modeCfg.variables.forEach(function(variable) {
      var name = variable._name();
      if (!name) return;
      Language.addDefinition(grammar, { name: name, });
    });
    modeCfg.lists.forEach(function(list) {
      var name = list._name();
      if (!name) return;
      Language.addDefinition(grammar, { name: name, value: [] });
    });
    modeCfg.definitions.forEach(function(result) {
      Language.addCustomBlock(grammar, result);
    });

    // store original grammar, for clearing scope correctly
    this.startGrammar = grammar;
    // custom block parameters are added to scopeGrammar
    this.scopeGrammar = this.startGrammar.copy()
    // TODO make a Completer and store it
  };

  State.prototype.copy = function() {
    var s = new State();
    s.lines = this.lines.slice();
    s.lineTokens = this.lineTokens.slice();
    s.indent = this.indent;

    // don't copy these. when they change, app will refresh the entire mode.
    // TODO instead copy across Completer object ref
    // for definition lines--create a fresh Completer
    // for blank lines --reset to the initial one
    s.startGrammar = this.startGrammar;
    if (this.isBlankLine) {
      s.scopeGrammar = null;
    } else {
      s.scopeGrammar = this.scopeGrammar;
    }
    return s;
  };

  State.prototype.parseAndPaint = function(tokens) {
    if (!tokens.length) {
      this.lines.push({info: {shape: 'blank'}});
      this.isBlankLine = true;
      return;
    }
    this.scopeGrammar = this.scopeGrammar || this.startGrammar;

    var p = new Earley.Parser(this.scopeGrammar);

    var result;
    try {
      results = p.parse(tokens);
    } catch (err) {
      this.lines.push({info: {shape: 'error', error: err.message}});
      results = err.partialResult;
    }

    if (!results) {
      // can't parse; mark line red
      tokens.forEach(function(t) { t.category = "error"; });
      return;
    }

    if (results.length > 1) {
      console.log("AMBIGUOUS: " + results.length + " results");
      results.forEach(function(result) {
        console.log(result.pretty());
      });
    }
    var result = results[0];
    result = result.process();

    // if definition, add parameters to scope
    if (result.info.selector === 'procDef') {
      this.scopeGrammar = this.scopeGrammar.copy();
      Language.addParameters(this.scopeGrammar, result);
      this.lines.push(result);
      return;
    }

    paintBlocks(result);
    if (result) {
      this.lines.push(result);
    }
    return result;
  }

  function paintBlocks(b) {
    if (!b) return;
    b.tokens.forEach(function(p) {
      if (p.info) {
        paintBlocks(p);
      } else {
        p.category = b.info.category;
        // TODO paint variables
      }
    });
  }

  function repr(b) {
    if (!b) return b;
    if (b.value) return b.value;
    if (!b.info) return b;
    switch (b.info.selector) {
      case "+": case "-": case "*": case "/": case "%": case "&": case "|":
        return [repr(b.args[0]), b.info.selector, repr(b.args[1])];
      default:
        return [b.info.selector || b.info.spec].concat(b.args.map(repr));
    }
  }

  /* CodeMirror mode */

  return {
    startState: function() { return new State(); },
    copyState:  function(state) { return state.copy(); },
    token: function(stream, state) {
      state.indent = stream.indentation();
      // TODO: context.
      // - are we in the first part of an `if` block?
      // - what about parameter scope?

      if (state.lineTokens.length === 0) {
        stream.match(Language.whitespacePat);

        var m = stream.match(Language.eolPat, false); // don't consume
        var line = m[0];
        var tokens = Language.tokenize(line);
        state.parseAndPaint(tokens);

        state.lineTokens = [];
        tokens.forEach(function(token) {
          if (token.kind === 'string') {
            var stringParts = Language.splitStringToken(token);
            state.lineTokens = state.lineTokens.concat(stringParts);
          } else {
            state.lineTokens.push(token);
          }
        });
      }

      if (!state.lineTokens.length) {
        stream.match(/[ \t]*$/); // blank line?
        return;
      }

      var token = state.lineTokens.shift();
      assert(stream.match(token.text), "Does not match stream: " + token);
      stream.match(Language.whitespacePat);
      var className = "s-" + token.kind;
      if (token.category) className += " " + "s-" + token.category;

      // fix closeBrackets
      if (token.kind === 'string') {
        className += " string";
      } else if (token.kind === 'error' && /^['"]/.test(token.text)) {
        return 'string';
      }

      return className;
    },

    blankLine: function(state) {
      state.parseAndPaint([]);
    },

    indent: function(state, textAfter) {
      var indent = parseInt(state.indent / cfg.indentUnit);
      var block = state.lines[state.lines.length - 1];
      if (block) {
        switch (block.info.shape) {
          case 'c-block':
          case 'c-block cap':
          case 'if-block':
          case 'else':
            indent++; break;
        }
      }

      // if this line is an `end`, dedent it.
      if (/^end$/.test(textAfter.trim())) indent--;
      if (/^else$/.test(textAfter.trim())) indent--;

      // return number of spaces to indent, taking indentUnit into account
      return cfg.indentUnit * indent;
    },

    lineComment: '//',
    electricInput: /( |else|end)$/,

    closeBrackets: "()[]''\"\"",

  };
});

CodeMirror.defineMode("text/x-tosh", "tosh");

