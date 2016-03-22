var Language = (function(Earley) {

  /* Tokenizer */

  var Token = function(kind, text, value) {
    this.kind = kind;
    this.text = text;
    this.value = value;
  };

  Token.prototype.toString = function() {
    var args = [this.kind, this.text, this.value];
    return "Token(" + args.map(JSON.stringify).join(", ") + ")";
  };

  Token.prototype.isEqual = function(other) {
    return this.kind === other.kind && this.value === other.value;
  };

  function getValue(token) {
    return token.value;
  }


  // TODO should we allow () as an empty number input slot?

  var TOKENS = [
    ['ellips',  /\.{3}/],
    ['comment', /\/{2}(.*)$/],
    ['false',   /\<\>/],
    ['zero',    /\(\)/],
    ['empty',   /_( |$)/],
    ['number',  /([0-9]+(\.[0-9]+)?e-?[0-9]+)/], // 123[.123]e[-]123
    ['number',  /((0|[1-9][0-9]*)?\.[0-9]+)/],   // [123].123
    ['number',  /((0|[1-9][0-9]*)\.[0-9]*)/],    // 123.[123]
    ['number',  /(0|[1-9][0-9]*)/],              // 123
    ['color',   /#([A-Fa-f0-9]{3}(?:[A-Fa-f0-9]{3})?)/],
    ['string',  /"((\\["\\]|[^"\\])*)"/], // strings are backslash-escaped
    ['string',  /'((\\['\\]|[^'\\])*)'/],
    ['lparen',  /\(/],   ['rparen',  /\)/],
    ['langle',  /\</],   ['rangle',  /\>/],
    ['lsquare', /\[/],   ['rsquare', /\]/],
    ['cloud',   /[☁]/],
    ['input',   /%[a-z](?:\.[a-zA-Z]+)?/],
    ['symbol',  /[-%#+*/=^,?]/],                // single character
    ['symbol',  /[_A-Za-z][-_A-Za-z0-9:',.]*/], // word, as in a block
    ['iden',    /[^ \t"'()<>=*\/+-]+/],     // user-defined names
  ];

  var backslashEscapeSingle = /(\\['\\])/g;
  var backslashEscapeDouble = /(\\["\\])/g;

  var whitespacePat = /^(?:[ \t]+|$)/;
  var eolPat = /(.*)[ \t]*/;

  var tokenize = function(input) {
    var remain = input;

    // consume whitespace
    var leadingWhitespace = '';
    var m = whitespacePat.exec(input);
    if (m) {
      leadingWhitespace = m[0];
      remain = remain.slice(m[0].length);
    }

    var tokens = [];
    var sawWhitespace = true;
    var expectedWhitespace = false;
    while (remain) {
      var kind = null;
      for (var i=0; i<TOKENS.length; i++) {
        var kind_and_pat = TOKENS[i],
            kind = kind_and_pat[0],
            pat  = kind_and_pat[1];
        var m = pat.exec(remain);
        if (m && m.index == 0) {
          var text = m[0];
          var value = m[1] === undefined ? m[0] : m[1];
          break;
        }
      }
      if (i === TOKENS.length) {
        tokens.push(new Token('error', remain, "Unknown token"));
        return tokens;
      }

      if (expectedWhitespace && text.length > 1) {
        // Both us and the previous token expected to see whitespace between us.
        // If there wasn't any, error.
        if (!sawWhitespace) {
          tokens.push(new Token('error', remain, "Expected whitespace"));
          return tokens;
        }
      }

      // consume token text
      remain = remain.slice(text.length);

      // consume whitespace
      var m = whitespacePat.exec(remain);
      sawWhitespace = Boolean(m);
      if (m) {
        remain = remain.slice(m[0].length);
        text += m[0];
      }
      if (kind === 'empty') sawWhitespace = true;

      // 'iden' adds onto the preceding 'symbol'
      if (kind === 'iden' && tokens.length) {
        var lastToken = tokens[tokens.length - 1];
        if (lastToken.kind === 'symbol' && !/[ \t]$/.test(lastToken.text)) {
          lastToken.text += text;
          lastToken.value += value;
          lastToken.kind = 'iden';
          expectedWhitespace = true;
          continue;
        }
      }

      // the first token gets the leading whitespace
      if (tokens.length === 0) {
        text = leadingWhitespace + text;
      }

      // push the token
      tokens.push(new Token(kind, text, value));

      expectedWhitespace = (text.length > 1);
    }
    return tokens;
  };

  function splitStringToken(token) {
    var quote = token.text.trim()[0];
    var backslashEscape = quote === '"' ? backslashEscapeDouble
                                        : backslashEscapeSingle;
    var parts = token.text.split(backslashEscape);
    assert(token.kind === 'string', "Want string token, not " + token);
    var tokens = [];
    for (var i=0; i<parts.length; i++) {
      var text = parts[i];
      if (!text) continue;

      if (text === "\\\\") {
        tokens.push(new Token('escape', '\\', '\\'));
        tokens.push(new Token('string', '\\', '\\'));
      } else if (text === "\\" + quote) {
        tokens.push(new Token('escape', '\\', '\\'));
        tokens.push(new Token('string', quote, quote));
      } else {
        // We have to trimLeft leading whitespace,
        // because mode.js will run whitespacePat after matching the token
        var m = whitespacePat.exec(text);
        if (m && m[0]) {
          assert(tokens.length);
          tokens[tokens.length - 1].text += m[0];
          text = text.slice(m[0].length);
        }

        tokens.push(new Token('string', text, text));
      }
    }
    return tokens;
  }

  /* for match()ing tokens */

  var SymbolSpec = function(kind, value) {
    this.kind = kind;
    this.value = value;
  };

  SymbolSpec.prototype.match = function(token) {
    if (this.kind === token.kind) {
      if (this.value === undefined) {
        return true;
      } else {
        return this.value === token.value;
      }
    } else {
      return false;
    }
  };

  SymbolSpec.prototype.generate = function() {
    var text = this.kind + ' '; // TODO which side?
    return new Token(this.kind, text, this.value || this.toString());
  };

  SymbolSpec.prototype.toString = function() {
    switch (this.kind) {
      case "symbol":  return this.value;
      case "lparen":  return "(";
      case "rparen":  return ")";
      case "langle":  return "<";
      case "rangle":  return ">";
      case "false":   return "<>";
      case "comment": return "// …";
    }
  };


  /* for defining grammars */

  var Grammar = Earley.Grammar;

  var Rule = function(name, symbols, process) {
    var ruleSymbols = symbols.map(function(symbol) {
      if (symbol instanceof Array) {
        assert(symbol.length === 1);
        symbol = {kind: "symbol", value: symbol[0]};
      }
      if (typeof symbol === "object") {
        symbol = new SymbolSpec(symbol.kind, symbol.value);
      }
      return symbol;
    });
    return new Earley.Rule(name, ruleSymbols, process);
  };


  /* helper functions */

  function identity(x) {
    assert(arguments.length == 1);
    return x;
  }

  function box(x) { return [x]; }

  function textSymbols(text) {
    return text.split(" ").map(box).map(function(x) {
      var tokens = tokenize(x[0])
      assert(tokens.length === 1, text + ": " + tokens);
      var token = tokens[0];
      if (token.kind !== "symbol") {
        assert(token.kind !== "error", text);
        return new SymbolSpec(token.kind, token.value);
      }
      return x;
    });
  }


  /* Grammar Processors */

  function literal(a) { assert(arguments.length === 1); return a.value; }
  function brackets(a, b, c) {
    // warning: mutates arguments
    if (a.kind == 'langle') a.display = '‹';
    if (c.kind == 'rangle') c.display = '›';
    return new Block(b.info, b.args, [a].concat(b.tokens).concat([c]));
  }
  function constant(x) {
    return function() { return x; }
  }
  function first(a) { return a; }
  function second(a, b) { return b; }
  function embed() {
    return {embed: [].slice.apply(arguments)};
  }
  function embedConstant(x) {
    return function() {
      return {constant: x, embed: [].slice.apply(arguments) };
    };
  }

  function num(a) {
    return parseFloat(literal(a));
  }

  function push(a, b) {
    a = a.slice();
    a.push(b);
    return a;
  }

  function push2(a, b, c) {
    a = a.slice();
    a.push(c);
    return a;
  }

  function paintLiteral(category) {
    // warning: mutates argument
    return function(a) {
      assert(arguments.length == 1);
      a.category = category;
      return a.value;
    }
  }

  function paintLiteralWords(category) {
    // warning: mutates argument
    return function() {
      var words = [].slice.apply(arguments);
      return words.map(function(a) {
        a.category = category;
        return a.value;
      }).join(" ");
    }
  }

  function paint(category) {
    // warning: mutates arguments
    return function() {
      var tokens = [].slice.apply(arguments);
      tokens.forEach(function(token) {
        token.category = category;
      });
      return tokens;
    };
  }

  function paintList(category) {
    // warning: mutates argument
    return function(a) {
      return a.map(function(token) {
        token.category = category;
        return token.value;
      }).join(" ");
    }
  }


  /* Define block grammar */

  function param(a, b, c) {
    // warning: mutates arguments
    a.category = c.category = "parameter";
    switch (a.kind) {
      case "lparen": return {arg: "n", name: b};
      case "langle": return {arg: "b", name: b};
      case "lsquare": return {arg: "s", name: b};
    }
  };

  function hackedParam(i, a, b, c) {
    // warning: mutates arguments
    i.category = a.category = c.category = "parameter";
    return {arg: i.value.slice(1), name: b};
  };


  function listItems(a, b, c) {
    // warning: mutates arguments
    a.category = c.category = "list";
    return b;
  }

  function definition(a, parts) {
    var isAtomic = a === 'define-atomic';

    var inputNames = [];
    var defaults = [];
    var specParts = parts.map(function(part) {
      if (typeof part === 'string') {
        return part;
      } else {
        inputNames.push(part.name);
        switch (part.arg) {
          case 'n': defaults.push(0);     return '%n';
          case 'b': defaults.push(false); return '%b';
          case 's': defaults.push("");   return '%s';
          default: defaults.push(""); return '%' + part.arg;
        }
      }
    });

    var spec = specParts.join(' ');
    var args = [spec, inputNames, defaults, isAtomic];

    var definition = {
      info: {shape: 'hat', selector: 'procDef'},
      args: args,
      _parts: parts,
    };
    return definition;
  }

  var defineGrammar = new Grammar([
      Rule("line", ["define", "spec-seq"], definition),

      Rule("define", [["define"]], paintLiteral("custom")),
      Rule("define", [["define-atomic"]], paintLiteral("custom")),

      Rule("spec-seq", ["spec-seq", "spec"], push),
      Rule("spec-seq", ["spec"], box),

      Rule("spec", [{kind: 'symbol'}], paintLiteral("custom")),
      Rule("spec", [{kind: 'iden'}], paintLiteral("custom")),
      Rule("spec", [{kind: 'number'}], paintLiteral("custom")),

      Rule("spec", [{kind: 'lparen'}, "arg-words", {kind: 'rparen'}], param),
      Rule("spec", [{kind: 'langle'}, "arg-words", {kind: 'rangle'}], param),
      Rule("spec", [{kind: 'lsquare'}, "arg-words", {kind: 'rsquare'}], param),
      Rule("spec", [{kind: 'input'}, {kind: 'lsquare'}, "arg-words", {kind: 'rsquare'}], hackedParam),

      Rule("arg-words", ["word-seq"], paintList("parameter")),

      Rule("word-seq", ["word-seq", "word"], push),
      Rule("word-seq", ["word"], box),

      Rule("word", [{kind: 'symbol'}], identity),
      Rule("word", [{kind: 'iden'}], identity),
      Rule("word", [{kind: 'number'}], identity),
  ]);


  /* Core grammar */

  var Block = function(info, args, tokens) {
    this.info = info;
    this.args = args;
    this.tokens = tokens;
  }

  function block(selector) {
    var indexes = [].slice.apply(arguments, [1]);
    var info = Scratch.blocksBySelector[selector];
    assert(info);
    return blockArgs.apply(null, [info].concat(indexes));
  }

  function blockArgs(info) {
    var indexes = [].slice.apply(arguments, [1]);
    var func = function() {
      var funcArgs = [].slice.apply(arguments);
      var args = indexes.map(function(i) {
        var arg = funcArgs[i];
        if (arg.constant) {
          arg = arg.constant;
        } else if (arg.embed) {
          arg = arg.embed.map(function(x) { return x.value; }).join(" ");
        }
        arg = arg.value || arg;
        return arg;
      });

      var tokens = [];
      funcArgs.forEach(function(value) {
        if (value && value.embed) {
          tokens = tokens.concat(value.embed);
        } else if (value && value.constant) {

        } else {
          if (value.kind === 'symbol' && info.display) {
            value.display = info.display;
          }
          tokens.push(value);
        }
      });

      // stop other scripts in sprite
      var outInfo = info;
      if (info.selector === 'stopScripts') {
        var option = args[0];
        if (['all', 'this script'].indexOf(option) === -1) {
          outInfo = Scratch.stopOtherScripts;
        }
      }

      // Coerce all the arguments to match their slots!
      for (var i=0; i<args.length; i++) {
        args[i] = convertArg(args[i], info.inputs[i]);
      }

      return new Block(outInfo, args, tokens);
    };
    func._info = info;
    return func;
  }

  function convertArg(arg, input) {
    if (typeof arg === 'object') return arg;

    if (input === '%n') {
      // nb. Empty number slots are zero
      return Number(arg) || 0;
    }
    // Make sure string inputs contain strings
    if (input === '%s') {
      return arg + '';
    }
    return arg;
  }

  function infix(info) {
    return blockArgs(Scratch.blocksBySelector[info], 0, 2);
  }

  function stringLiteral(a) {
    assert(arguments.length === 1);
    var quote = a.text.trim()[0];
    var backslashEscape = quote === '"' ? backslashEscapeDouble
                                        : backslashEscapeSingle;
    var parts = a.value.split(backslashEscape);
    return parts.map(function(p) {
      if (p === "\\\\") return "\\";
      if (p === "\\"+quote) return quote;
      return p;
    }).join("");
  }

  var colors = {
    red: '#e50000',
    orange: '#f97306',
    yellow: '#ffff14',
    green: '#15b01a',
    blue: '#0343df',
    purple: '#7e1e9c',
    black: '#000',
    white: '#fff',
    pink: '#ff81c0',
    brown: '#653700',
  }; // from http://blog.xkcd.com/2010/05/03/color-survey-results/

  function colorLiteral(a) {
    // warning: mutates arguments
    var color = colors[a.value];
    if (color !== '#fff') a.color = color;
    a.kind = 'color';
    return color;
  }

  function hexColor(a) {
    var h = a.value;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return parseInt(h, 16);
  }

  function unaryMinus(a, b) {
    // warning: mutates arguments
    a.category = 'number';
    return -num(b);
  }

  /* precedence
   *
   *  [loosest]
   *              stack blocks              eg. move … steps
   *              arithmetic                eg. + -
   *                                        eg. * /
   *              numeric reporter blocks   eg. sin of …
   *              simple reporters          eg. x position
   *  [tightest]
   *
   * Looks like this:
   *
   *
   *   [stack blocks]
   * 8. and, or
   * 7. not
   * 6. <, >, =
   *
   * 4. +, -
   * 3. *, /, mod
   * 2. right-recursive reporters
   * 1. parentheses, simple reporters
   * 0. literals
   *
   */

  var g = new Grammar([
    Rule("line", ["thing"], identity),
    // Rule("line", ["thing", {kind: 'comment'}], first),
    // Rule("line", [{kind: 'comment'}], constant(undefined)),

    Rule("thing", ["block"], identity),
    Rule("thing", ["r-parens"], identity),
    Rule("thing", ["b-parens"], identity),

    /* --------------------------------------------------------------------- */

    // there are lots of "block" rules
    // which use the inputs:  "n", "sb", "b", "c"
    //
    // they also have menu inputs, some of which accept reporters,
    // so they use the production "sb"

    /* --------------------------------------------------------------------- */

    Rule("n", ["n4"], identity),

    Rule("sb", ["join"], identity),
    Rule("sb", ["n4"], identity),
    Rule("sb", ["s0"], identity),

    Rule("b", ["b8"], identity),

    Rule("c", ["r-parens"], identity),
    Rule("c", ["c0"], identity),

    /* --------------------------------------------------------------------- */

    Rule("r-parens", [{kind: 'lparen'}, "r-value", {kind: 'rparen'}], brackets),

    Rule("r-value", ["join"], identity),
    Rule("r-value", ["n4"], identity),
      //  r-value -> ListName

    Rule("b-parens", [{kind: 'langle'}, "b8", {kind: 'rangle'}], brackets),

    // ---

    // There are some "reporter" and a few "predicate" rules
    // which have no expression-accepting inputs.

    //       . . .     "simple-reporter"
    Rule("predicate", ["simple-predicate"], identity),

    // The rest get defined here, because I like my sanity.

    Rule("join", [["join"], "jpart", "jpart"],
                                            block("concatenate:with:", 1, 2)),

    Rule("jpart", ["s0"], identity),
    Rule("jpart", [{kind: 'empty'}], constant("")),
    Rule("jpart", ["join"], identity),
    Rule("jpart", ["r-parens"], identity),
    Rule("jpart", ["b-parens"], identity),

    // "join" on the LHS of a comparison is *confusing*

    Rule("predicate", [["touching"], ["color"], "c", ["?"]],
                                            block("touchingColor:", 2)),
    Rule("predicate", [["color"], "c", ["is"], ["touching"], "c", ["?"]],
                                            block("color:sees:", 1, 4)),

    /* --------------------------------------------------------------------- */

    Rule("b8", ["b-and"], identity),
    Rule("b8", ["b-or"], identity),
    Rule("b8", ["b7"], identity),

    // require parentheses when nesting and/or
    Rule("b-and", ["b-and", ["and"], "b7"], infix("&")),
    Rule("b-and", ["b7", ["and"], "b7"], infix("&")),

    Rule("b-or", ["b-or", ["or"], "b7"], infix("|")),
    Rule("b-or", ["b7", ["or"], "b7"], infix("|")),

    Rule("b7", [["not"], "b7"], block("not", 1)),
    Rule("b7", ["b6"], identity),

    // nb.  "<" and ">" do not tokenize as normal symbols
    // also note comparison ops accept *booleans*!
    Rule("b6", ["sb", {kind: 'langle'}, "sb"], infix("<")),
    Rule("b6", ["sb", {kind: 'rangle'}, "sb"], infix(">")),
    Rule("b6", ["sb", ["="], "sb"], infix("=")),
    Rule("b6", ["m_list", ["contains"], "sb", ["?"]], infix("list:contains:")),
    Rule("b6", ["predicate"], identity),
    Rule("b6", ["b2"], identity),

    Rule("b2", ["b-parens"], identity),
    Rule("b2", ["b0"], identity),

    // ---

    Rule("n4", ["n4", ["+"], "n3"], infix("+")),
    Rule("n4", ["n4", ["-"], "n3"], infix("-")),
    Rule("n4", ["n3"], identity),

    Rule("n3", ["n3", ["*"],   "n2"], infix("*")),
    Rule("n3", ["n3", ["/"],   "n2"], infix("/")),
    Rule("n3", ["n3", ["mod"], "n2"], infix("%")),
    Rule("n3", ["n2"], identity),

    Rule("n2", [["round"], "n2"],           block("rounded", 1)),
    Rule("n2", ["m_mathOp", ["of"], "n2"],  infix("computeFunction:of:")),
    Rule("n2", [["pick"], ["random"], "n4", ["to"], "n2"],
                                            block("randomFrom:to:", 2, 4)),
    Rule("n2", ["m_attribute", ["of"], "m_spriteOrStage"],
                                            block("getAttribute:of:", 0, 2)),
    Rule("n2", [["distance"], ["to"], "m_spriteOrMouse"],
                                            block("distanceTo:", 2)),
    Rule("n2", [["length"], ["of"], "s2"],  block("stringLength:", 2)),
    Rule("n2", [["letter"], "n", ["of"], "s2"],
                                            block("letter:of:", 1, 3)),
    Rule("n2", ["n1"], identity),

    Rule("n1", ["simple-reporter"], identity),
    Rule("n1", ["r-parens"], identity),
    Rule("n1", ["b-parens"], identity),
    Rule("n1", ["n0"], identity),

    // ---

    Rule("s2", ["s0"], identity),
    Rule("s2", ["n1"], identity),

    /* --------------------------------------------------------------------- */

    Rule("n0", [["-"], {kind: 'number'}], unaryMinus),
    Rule("n0", [{kind: 'number'}], num),
    Rule("n0", [{kind: 'empty'}], constant("")),

    Rule("s0", [{kind: 'string'}], stringLiteral),

    Rule("b0", [{kind: 'false'}], constant(false)), // "<>"

    Rule("c0", [{kind: 'color'}], hexColor),

    /* --------------------------------------------------------------------- */

    Rule("@greenFlag", [["flag"]], paint("green")),
    Rule("@greenFlag", [["green"], ["flag"]], paint("green")),

    Rule("@turnLeft",  [["ccw"]], identity),
    Rule("@turnLeft",  [["left"]], identity),

    Rule("@turnRight", [["cw"]], identity),
    Rule("@turnRight", [["right"]], identity),

  ], ["VariableName", "ListName", "AttributeVariable", "ReporterParam", "BooleanParam"]);

  var coreGrammar = g.copy();

  // TODO: parse +'s as variable arity, so we can "balance" the trees later on



  /* Color literals */

  Object.keys(colors).forEach(function(name) {
    g.addRule(Rule("c0", [{kind: 'symbol', value: name}], colorLiteral));
  });

  /* Menu options */

  var menus = ['attribute', 'backdrop', 'broadcast', 'costume', 'effect',
      'key', 'list', 'location', 'mathOp', 'rotationStyle', 'scene', 'sound',
      'spriteOnly', 'spriteOrMouse', 'spriteOrStage', 'stageOrThis', 'stop',
      'timeAndDate', 'touching', 'triggerSensor', 'var', 'varName',
        'videoMotionType', 'videoState'];

  var numberMenus = ["direction", "drum", "instrument", "listDeleteItem",
      "listItem", "note"];

  var menusThatAcceptReporters = ['broadcast', 'costume', 'backdrop',
      'location', 'scene', 'sound', 'spriteOnly', 'spriteOrMouse',
      'spriteOrStage', 'touching'];

  var menuOptions = {
    'attribute': ['x position', 'y position', 'direction', 'costume #', 'costume name', 'backdrop #', 'backdrop name', 'size', 'volume'],
    'backdrop': [],
    'booleanSensor': ['button pressed', 'A connected', 'B connected',
    'C connected', 'D connected'],
    'broadcast': [],
    'costume': [],
    'effect': ['color', 'fisheye', 'whirl', 'pixelate', 'mosaic',
    'brightness', 'ghost'],
    'key': ['space', 'up arrow', 'down arrow', 'right arrow', 'left arrow',
      'any', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 0, 1, 2,
      3, 4, 5, 6, 7, 8, 9],
    'list': [],
    'listDeleteItem': ['last', 'all'],
    'listItem': ['last', 'random'],
    'location': ['mouse-pointer', 'random position'],
    'mathOp': ['abs', 'floor', 'ceiling', 'sqrt', 'sin', 'cos', 'tan',
    'asin', 'acos', 'atan', 'ln', 'log', 'e ^', '10 ^'],
    'motorDirection': ['this way', 'that way', 'reverse'],
    'rotationStyle': ['left-right', "don't rotate", 'all around'],
    'sensor': ['slider', 'light', 'sound', 'resistance-A', 'resistance-B',
    'resistance-C', 'resistance-D'],
    'sound': [],
    'spriteOnly': ['myself'],
    'spriteOrMouse': ['mouse-pointer'],
    'spriteOrStage': ['Stage'],
    'stageOrThis': ['Stage', 'this sprite'],
    'stop': ['all', 'this script', 'other scripts in sprite'],
    'timeAndDate': ['year', 'month', 'date', 'day of week', 'hour',
    'minute', 'second'],
    'touching': ['mouse-pointer', 'edge'],
    'triggerSensor': ['loudness', 'timer', 'video motion'],
    'var': [],
    'videoMotionType': ['motion', 'direction'],
    'videoState': ['off', 'on', 'on-flipped'],
  };

  // only generate number literals for some blocks
  var blocksWithNumberLiterals = [
    'setVar:to:',
    '<', '>', '=',
  ];
  // force string literals for:
  //  'concatenate:with:',
  //  'append:toList:',
  //  'insert:at:ofList:',
  //  say
  //  think
  //  ask
  //  letter:of:
  //  stringLength:
  //  list:contains:
  // ]

  var menuValues = {
    'mouse-pointer': '_mouse_',
    'myself': '_myself_',
    'Stage': '_stage_',
    'edge': '_edge_',
    'random position': '_random_',
    // 'stageOrThis' does not use this
  }

  menus.forEach(function(name) {
    if (menusThatAcceptReporters.indexOf(name) > -1) {
      g.addRule(Rule("m_" + name, ["jpart"], identity));
    }
    var options = menuOptions[name];
    if (options && options.length) {
      options.forEach(function(option) {
        var symbols;
        if (typeof option === "number") {
          symbols = [{kind: 'number', value: String(option)}];
        } else {
          symbols = textSymbols(option);
        }
        process = embed;
        var value;
        if (name !== 'stageOrThis') value = menuValues[option];
        if (value) {
          process = embedConstant(value);
        }
        g.addRule(Rule("m_" + name, symbols, process));
      });
    }
    g.addRule(Rule("m_" + name, [{kind: 'empty'}], literal));
    /*if (name === "broadcast") {
      g.addRule(Rule("m_" + name, [{kind: 'menu'}], literal));
    } else {
      g.addRule(Rule("m_" + name, [{kind: 'menu'}], identity));
    }*/
  });

  numberMenus.forEach(function(name) {
    var options = menuOptions[name];
    if (options && options.length) {
      options.forEach(function(option) {
        g.addRule(Rule("d_" + name, textSymbols(option), identity));
      });
    }
    g.addRule(Rule("d_" + name, ["n"], identity));
  });

  // TODO:  "(last v)"

  g.addRule(Rule("m_attribute", ["jpart"], identity));
  g.addRule(Rule("m_var", ["VariableName"], identity));
  g.addRule(Rule("m_varName", ["VariableName"], identity));
  g.addRule(Rule("m_list", ["ListName"], identity));


  /* For Compiler.generate() */

  var precedenceLevels = [
    // custom block args = -2
    // join = -1
    [], // zero
    ['*', '/', '%'],
    ['+', '-'],
    ['=', '<', '>', 'list:contains:'],
    ['not'],
    ['&',],  // actually & and | have the same precedence!
    ['|',],  // except they must be parenthesised when inside each other.
    // [ stack blocks ]
  ];

  var precedence = {};
  precedenceLevels.forEach(function(list, index) {
    list.forEach(function(selector) {
      precedence[selector] = index;
    });
  });

  // special-case "join"
  precedence['concatenate:with:'] = -1;


  /* Add rules for blocks */

  var alreadyDefined = [
    'letter:of:', 'concatenate:with:',

    '&', '|', 'not',
    '=', '<', '>', 'list:contains:',

    'randomFrom:to:', 'stringLength:', 'rounded', 'computeFunction:of:',
    'getAttribute:of:', 'distanceTo:',

    '*', '/', '%',
    '+', '-',

    'doIf', // doIf and doIfElse have the same grammar rule!

    'touchingColor:', 'color:sees:',
  ];

  var doneSpecs = {};
  Scratch.blocks.forEach(function(block) {
    if (alreadyDefined.indexOf(block.selector) > -1) return;
    if (doneSpecs[block.spec] && block.selector !== 'getParam') {
      return;
    }
    doneSpecs[block.spec] = true;

    var symbols = [];
    var argIndexes = [];

    block.parts.forEach(function(part, i) {
      var m = Scratch.inputPat.exec(part);
      if (!m) {
        part.split(/(\?)|[ ]+/g).forEach(function(word) {
          if (!word) return;
          if (/^@/.test(word)) {
            symbols.push(word);
          } else {
            var more = textSymbols(word);
            assert(more.length === 1);
            symbols.push(more[0]);
          }
        });
      } else {
        var input = m[1].slice(1).replace(".", "_")
        if (!/^[mdc]/.test(input)) {
          assert(!(block.shape === "reporter" || block.shape === "predicate"),
                 block.selector + " " + block.spec);
        }
        // to make my brain not hurt, we define any reporters with non-menu
        // inputs as part of the core grammar.

        if (input === 's') input = 'sb'; // strings accept booleans!

        argIndexes.push(symbols.length);
        symbols.push(input);
      }
    });

    var type = (block.shape === "reporter" ? "simple-reporter" :
                block.shape === "predicate" ? "simple-predicate" : "block");

    if (block.selector === "readVariable") {
      symbols = ["VariableName"];
    } else if (block.selector === "contentsOfList:") {
      symbols = ["ListName"];
      type = 'r-value';
    } else if (block.selector === "getParam") {
      symbols = [block.shape === 'reporter' ? "ReporterParam" : "BooleanParam"];
    }

    assert(symbols.length);

    g.addRule(Rule(type, symbols,
                       blockArgs.apply(null, [block].concat(argIndexes))));
  });


  /* Add rules for definitions */

  defineGrammar.rules.forEach(g.addRule.bind(g));



  /* for parsing `define`s */

  function paintSymbols(category) {
    // warning: mutates arguments
    return function() {
      var tokens = [].slice.apply(arguments);
      tokens.forEach(function(token) {
        token.category = category;
      });
      return tokens.map(function(t) { return t.value; }).join(" ");
    };
  }

  function addDefinition(grammar, result) {
    var symbols = nameSymbols(result.name);
    var kind = result.value instanceof Array ? "ListName" : "VariableName";
    grammar.addRule(new Rule(kind, symbols, embed));
  }

  function addCustomBlock(grammar, result) {
    var isAtomic = result.args[3];
    var specParts = result._parts;

    var parts = [];

    specParts.forEach(function(x, index) {
      if (x.arg) {
        parts.push("%" + x.arg);
      } else {
        parts.push(x);
      }
    });
    var spec = parts.join(" ");

    // spec = cleanName('custom', spec, {}, {});

    var symbols = [];
    var parts = spec.split(Scratch.inputPat);
    var argIndexes = [];
    parts.forEach(function(part) {
      if (!part) return;
      if (Scratch.inputPat.test(part)) {
        var arg = part.slice(1).replace(".", "_");
        if (arg === 's') arg = 'sb';
        argIndexes.push(symbols.length);
        symbols.push(arg);
      } else {
        var words = tokenize(part);
        words.forEach(function(token) {
          symbols.push(new SymbolSpec(token.kind, token.value));
        });
      }
    });

    var info = {
      isCustom: true,
      spec: spec,
      parts: parts,
      category: "custom",
      shape: 'stack',
    };
    info.inputs = info.parts.filter(function(p) {
      return Scratch.inputPat.test(p);
    });

    grammar.addRule(new Rule("block", symbols,
                        blockArgs.apply(null, [info].concat(argIndexes))));
    return info;
  }

  function addParameters(grammar, result) {
    var isAtomic = result.args[3];
    var specParts = result._parts;

    specParts.forEach(function(x, index) {
      if (x.arg) {
        var name = x.arg === 'b' ? "BooleanParam" : "ReporterParam";
        grammar.addRule(new Rule(name, nameSymbols(x.name),
                              paintLiteralWords("parameter")));
      }
    });
  }


  /* for variable (re)naming */

  function nameSymbols(text) {
    var tokens = tokenize(text);
    return tokens.map(function(token) {
      assert(token.kind !== "error", text);
      return new SymbolSpec(token.kind, token.value);
    });
  }

  var reservedNames = [
    // conflicts with set _ to _
    'x',
    'y',
    'z', // so people don't hate me
    'pen color',
    'pen shade',
    'pen size',
    'video transparency',
    'instrument',
    'color effect',
    'whirl effect',
    'pixelate effect',
    'mosaic effect',
    'brightness effect',
    'ghost effect',
    'fisheye effect',

    // found in the attribute _ of _ block
    'costume name',

    // simple reporters
    'x position',
    'y position',
    'direction',
    'costume #',
    'size',
    'backdrop name',
    'backdrop #',
    'volume',
    'tempo',
    'answer',
    'mouse x',
    'mouse y',
    'loudness',
    'timer',
    'current year',
    'current month',
    'current date',
    'current day of week',
    'current hour',
    'current minute',
    'current second',
    'days since 2000',
    'username',

    // menusThatAcceptReporters
    'mouse-pointer',
    'Stage',
    'edge',

    // d_-style number-menus
    'all',
    'last',
    'random',
  ];

  var reservedWords = [
    'to',
    'on',
    'of',
    'for',
    'with',
  ];

  function cleanName(kind, name, seen, stageSeen) {
    var original = name;
    var lastToken;
    while (true) {
      var tokens = Language.tokenize(name);
      if (!tokens.length) break;

      var lastToken = tokens[tokens.length - 1];
      var suffix = "";
      if (lastToken.kind !== 'error') break;

      if (lastToken.value === "Expected whitespace") {
        suffix = " " + lastToken.text;
      } else {
        suffix = lastToken.text.slice(1);
      }
      tokens.pop();
      var name = tokens.map(getValue).join(" ");
      name += suffix;
    }
    tokens.forEach(function(token, index) {
      if (token.kind === 'lparen' || token.kind === 'langle') {
        var next = tokens[index + 1];
        if (next && (next.kind === 'iden' || next.kind === 'symbol')) {
          next.value = '_' + next.value;
          next.kind = 'iden';
        }
      }
      if (token.kind === 'rparen' || token.kind === 'rangle') {
        var next = tokens[index - 1];
        if (next && (next.kind === 'iden' || next.kind === 'symbol')) {
          next.value = next.value + '_';
          next.kind = 'iden';
        }
      }
    });
    tokens = tokens.filter(function(token, index) {
      return (
        (token.kind === 'symbol' && !/^[=*\/+-]$/.test(token.value)) ||
        token.kind === 'iden' ||
        token.kind === 'number' ||
        (token.kind === 'cloud' && index === 0) ||
        (token.kind === 'input' && kind === 'custom')
        // reserved words
      ) && reservedWords.indexOf(token.value) === -1
        && (token.value !== 'y:' || kind === 'custom');
    });
    name = tokens.map(getValue).join(" ");

    // don't put space before question mark
    name = name.replace(/ \?( |$)/g, "?");

    var shortKind = kind === 'variable' ? "var"
                  : kind === 'parameter' ? "arg" : kind;
    if (!name) {
      name = /^[^a-zA-Z]$/.test(original) ? "_" : shortKind;
    }

    nameSymbols(name); // Check this doesn't crash

    var isInvalid = (
      // reserved names
      reservedNames.indexOf(name) > -1 ||
      // name can't be a number token
      /^[0-9]+(\.[0-9]+)?$/.test(name)
    );

    // if ambiguous or non-unique, add shortKind
    if (name !== "_" && (
          isInvalid ||
          ((stageSeen.hasOwnProperty(name) || seen.hasOwnProperty(name)) && kind === 'parameter')
        )) {
      if (name) name += " ";
      name += shortKind;
    }

    // if still not unique, add a number
    var offset = 1;
    var prefix = name;
    while (name === "_" || name === shortKind || stageSeen.hasOwnProperty(name) || seen.hasOwnProperty(name)) {
      name = prefix + offset;
      offset++;
    }

    return name;
  }



  /* for c-blocks and `end`s */

  var LineSpec = function(obj) {
    this.obj = obj;
  };

  LineSpec.prototype.match = function(block) {
    var keys = Object.keys(this.obj);
    for (var i=0; i<keys.length; i++) {
      var key = keys[i];
      if (block.info[key] !== this.obj[key]) return false;
    }
    return true;
  };

  var ShapeRule = function(s) {
    return Rule(s, [new LineSpec({shape: s})], identity);
  };

  function cons(a, b) {
    b = b.slice();
    b.splice(0, 0, a);
    return b;
  }

  function consPush(a, b, c) {
    b = b.slice();
    b.splice(0, 0, a);
    b.push(c);
    return b;
  }

  // TODO remove or use
  blockGrammar = new Grammar([
      Rule("script-list", ["script"], box),
      Rule("script-list", ["script-list", "blank-line", "script"], push2),

//      Rule("script", ["lines", "cap"], push),
//      Rule("script", ["hat", "lines"], cons),
//      Rule("script", ["hat", "lines", "cap"], consPush),
      Rule("script", ["lines"], identity),

      Rule("lines", ["stack"], box),
      Rule("lines", ["lines", "stack"], push),

      ShapeRule("hat"),
      ShapeRule("stack"),
      ShapeRule("cap"),

      Rule("blank-line", [new LineSpec({blank: true})], constant(null)),
  ]);


  /* for parseLines */

  function isDefinitionLine(line) {
    return /^define(-atomic)? /.test(line);
  }

  function modeGrammar(modeCfg) {
    var grammar = g.copy();
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
    return grammar;
  }


  // selectors sorted for completion:
  // - part based on block usage data
  // - part based on usability guesswork (eg. blocks before their `and wait` versions)
  // - part opinionated (eg. I use cloning a lot, and phosphorus doesn't support video) 

  var preferSelectors = [
    /* predicates */

    'BooleanParam',
    'color:sees:',
    'touching:',
    'touchingColor:',
    'mousePressed',
    'keyPressed:',
    'list:contains:',
    'not',

    /* reporters */
    'ReporterParam',
    'VariableName',

    '+',
    '-',
    '*',
    '/',

    '%',

    'stringLength:',
    'letter:of:',
    'lineCountOfList:',
    'timer',

    'rounded',
    'computeFunction:of:',

    'heading',
    'distanceTo:',
    'costumeIndex',
    'backgroundIndex',
    'sceneName',

    'randomFrom:to:',

    'timeAndDate',

    'mouseX',
    'mouseY',
    'getUserName',
    'tempo',
    'volume',
    'soundLevel',

    'getLine:ofList',
    'getAttribute:of:',

    'senseVideoMotion',

    /* blocks */

    // 'call', TODO sort calls first

    'append:toList:',
    'doAsk',

    'broadcast:',
    'doBroadcastAndWait',
,
    'changeXposBy:',
    'changeYposBy:',
    'changeGraphicEffect:by:',
    'changeSizeBy:',
    'changePenSizeBy:',
    'changePenHueBy:',
    'changePenShadeBy:',
    'changeVolumeBy:',
    'changeTempoBy:',
    'changeVar:by:', // TODO sort vars first

    'clearPenTrails',
    'filterReset',

    'createCloneOf',

    // 'procDef'
    'deleteClone',
    'deleteLine:ofList:',

    'doForever',

    'gotoX:y:',
    'goToSpriteOrMouse:',
    'comeToFront',
    'goBackByLayers:',
    'glideSecs:toX:y:elapsed:from:',

    'hide',
    'hideVariable:',
    'hideList:',

    'doIf',
    'doIfElse', // filtered later anyway
    'insert:at:ofList:',
    'bounceOffEdge',

    'nextCostume',
    'nextScene',

    'heading:',
    'pointTowards:',
    'putPenDown',
    'putPenUp',
    'playSound:',
    'doPlaySoundAndWait',
    'noteOn:duration:elapsed:from:',
    'playDrum',

    'doRepeat',
    'doUntil',
    'setLine:ofList:to:',
    'timerReset',
    'rest:elapsed:from:',

    'say:',
    'say:duration:elapsed:from:',

    'setVar:to:',
    'xpos:',
    'ypos:',
    'setGraphicEffect:to:',
    'setSizeTo:',
    'penSize:',
    'penColor:',
    'setPenHueTo:',
    'setPenShadeTo:',
    'setVolumeTo:',
    'setRotationStyle',
    'instrument:',
    'setTempoTo:',
    'setVideoTransparency',

    'show',
    'showVariable:',
    'showList:',

    'stopScripts',
    'stopAllSounds',
    'stampCostume',

    'lookLike:',
    'startScene',
    'startSceneAndWait',

    'turnRight:',
    'turnLeft:',
    'think:',
    'think:duration:elapsed:from:',
    'setVideoState',

    'whenGreenFlag',

    'wait:elapsed:from:',
    'doWaitUntil',

    'whenKeyPressed',
    'whenCloned',
    'whenIReceive',
    'whenClicked',
    'keyPressed:',
    //'whenSensorGreaterThan', TODO completion for this
    'whenSceneStarts',

    'end',
    'else',
  ];


  return {
    tokenize: tokenize,
    defineGrammar: defineGrammar,
    grammar: g,
    _coreGrammar: coreGrammar, // DEBUG
    blockGrammar: blockGrammar,
    whitespacePat: whitespacePat,
    eolPat: eolPat,
    addDefinition: addDefinition,
    addCustomBlock: addCustomBlock,
    splitStringToken: splitStringToken,
    addParameters: addParameters,

    // for Compiler
    precedence: precedence,
    menusThatAcceptReporters: menusThatAcceptReporters,
    menuOptions: menuOptions,
    blocksWithNumberLiterals: blocksWithNumberLiterals,

    // for automatic variable renaming
    cleanName: cleanName,

    // for parseLines
    isDefinitionLine: isDefinitionLine,
    modeGrammar: modeGrammar,

    // for completion
    preferSelectors: preferSelectors,
  };

}(Earley));

