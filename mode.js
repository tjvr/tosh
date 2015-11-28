CodeMirror.defineMode("tosh", function(cfg, modeCfg) {

  function deepCopy(x) {
    return JSON.parse(JSON.stringify(x));
  }

  var State = function() {
    this.lines = [];
    this.lineTokens = [];
    this.grammar = Language.grammar.copy();
    this.customBlocks = {};
    this.indent = 0;

    var _this = this;
    cfg.scratchVariables.forEach(function(variable) {
      var name = variable._name();
      if (!name) return;
      Language.addDefinition(_this.grammar, { name: name, });
    });
    cfg.scratchLists.forEach(function(list) {
      var name = list._name();
      if (!name) return;
      Language.addDefinition(_this.grammar, { name: name, value: [] });
    });

    cfg.scratchDefinitions.forEach(function(result) {
      var info = Language.addCustomBlock(_this.grammar, result);
      _this.customBlocks[info.spec] = info;
    });
  };

  State.prototype.copy = function() {
    var s = new State();
    s.lines = this.lines.slice();
    s.lineTokens = this.lineTokens.slice();
    s.indent = this.indent;

    // don't copy these. when they change, app will refresh the entire mode.
    s.grammar = this.grammar;
    s.customBlocks = this.customBlocks;
    return s;
  };

  State.prototype.parseAndPaint = function(tokens) {
    if (!tokens.length) {
      this.lines.push({info: {shape: 'blank'}});
      return;
    }

    var defineParser = new Earley.Parser(Language.defineGrammar);

    function isDefineToken(t) {
      return t.kind === "symbol" && t.value === "define";
    }

    var define = null;
    try {
      var results = defineParser.parse(tokens);
      define = results[0].process();
    } catch (err) {}
    if (define) {
      // paint the first few words properly, to workaround broken grammar
      // TODO fix grammar
      for (var i=0; i<tokens.length; i++) {
        var token = tokens[i];
        if (token.kind == 'lparen') break;
        token.category = 'custom';
      }

      // make the definition block

      var isAtomic = (define[0] === 'atomic');
      if (isAtomic) define.shift();

      var inputNames = [];
      var defaults = [];
      var specParts = define.map(function(part) {
        if (typeof part === 'string') {
          return part;
        } else {
          inputNames.push(part.name);
          switch (part.arg) {
            case 'n': defaults.push(0);     return '%n';
            case 'b': defaults.push(false); return '%b';
            case 's': defaults.push("");    return '%s';
          }
        }
      });

      var spec = specParts.join(' ');
      var args = [spec, inputNames, defaults, isAtomic];
      this.lines.push({info: {shape: 'hat', selector: 'procDef'}, args: args});
      return;
    }

    var p = new Earley.Parser(this.grammar);

    var result;
    try {
      results = p.parse(tokens);
    } catch (err) {
      console.log(err); // DEBUG
      this.lines.push({info: {shape: 'error'}});
      results = err.partialResult;
    }

    if (!results) {
      // can't parse; mark line red
      tokens.forEach(function(t) { t.category = "error"; });
      return;
    }

    var result = results[0];
    result = result.process();
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
        // console.log(JSON.stringify(line));
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

  };
});

CodeMirror.defineMode("text/x-tosh", "tosh");

