CodeMirror.defineMode("tosh", function(cfg, modeCfg) {

  function deepCopy(x) {
    return JSON.parse(JSON.stringify(x));
  }

  var State = function() {
    this.lines = [];
    this.lineTokens = [];
    this.grammar = Language.grammar.copy();
    this.customBlocks = {};

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
  };

  State.prototype.copy = function() {
    var s = new State();
    s.lines = this.lines.slice();
    s.lineTokens = this.lineTokens.slice();
    s.grammar = this.grammar.copy();
    s.customBlocks = deepCopy(this.customBlocks);
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

    var result = null;
    try {
      var results = defineParser.parse(tokens);
      result = tokens.definitionValue = results[0];
    } catch (err) {}
    if (result) {
      if (result.name) {
        var info = Language.addDefinition(this.grammar, result);
        switch (info.kind) {
          case 'variable': this.variables[info.name] = info.value; break;
          case 'list':     this.lists[info.name] = info.value; break;
        }
      } else {
        var info = Language.addCustomBlock(this.grammar, result);
        this.customBlocks[info.spec] = info;
        for (var i=0; i<tokens.length; i++) { // TODO fix grammar
          var token = tokens[i];
          if (token.kind == 'lparen') break;
          token.category = 'custom';
        }
      }
      return;
    }

    // if you define a variable twice,
    // the grammar becomes ambiguous
    // so there are 2^n parses for a line with n doubled-up variables...

    var p = new Earley.Parser(this.grammar);

    var define = tokens.definitionValue;
    //if (define) return; // TODO process define hats...
    var result;
    try {
      results = p.parse(tokens);
      if (results.length > 1) throw "ambiguous. count: " + results.length;
    } catch (err) {
      console.log(err);
      this.lines.push({info: {shape: 'error'}});
      results = err.partialResult;
    }

    window.results = results;

    // TODO:
    // - error tokens
    // - incomplete input
    // - invalid input

    if (!results) {
      // TODO mark error'd lines as red
      tokens.forEach(function(t) { t.category = "error"; });
      return;
    }

    // assert(results.length === 1);
    // var result = results[0];
    results.forEach(function(result) {
      // console.log(result);
      // console.log(JSON.stringify(repr(result)));
      // console.log(JSON.stringify(compile(result)));
    });

    var result = results[0];
    paintBlocks(result);

    if (result) {
      this.lines.push(result);
    }

    window.lines = this.lines;
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

  // TODO: parser remembers custom blocks between parses

  /* CodeMirror mode */

  return {
    startState: function() { return new State(); },
    copyState:  function(state) { return state.copy(); },
    token: function(stream, state) {
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
      assert(stream.match(token.text), token);
      stream.match(Language.whitespacePat);
      var className = "s-" + token.kind;
      if (token.category) className += " " + "s-" + token.category;
      return className;
    },

    blankLine: function(state) {
      state.parseAndPaint([]);
    },

    /*indent: function(state, textAfter) {
      // return number of spaces to indent, taking indentUnit into account
      return 1;
    },*/

    lineComment: '//',
    // electricInput: /(?: |end)$/,

  };
});

CodeMirror.defineMode("text/x-tosh", "tosh");

