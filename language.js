// TODO stop other scripts in stage

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

  var TOKENS = [
    ['comment', /\/{2}(.*)$/],
    ['false',   /\<\>/],
    ['zero',    /\(\)/],
    ['empty',   /_/],
    ['number',  /([0-9]+e[0-9]+)/],
    ['number',  /([0-9]+\.[0-9]*)/],
    ['number',  /([0-9]*\.[0-9]+)/],
    ['number',  /([0-9]+)/],
    ['color',   /(#[A-Fa-f0-9]{3}(?:[A-Fa-f0-9]{3})?)/],
    ['string',  /"((?:\\['"\\]|[^"])*)"/],
    ['string',  /'((?:\\['"\\]|[^'])*)'/],
    ['lparen',  /\(/],   ['rparen',  /\)/],
    ['langle',  /\</],   ['rangle',  /\>/],
    ['lsquare', /\[/],   ['rsquare', /\]/],
    ['symbol',  /\.{3}/],                        // ellipsis
    ['symbol',  /[-%#+*/=^,↻↺⚑?]/],              // single character
//  ['symbol',  /[_A-Za-z][-_A-Za-z0-9:',]*/],   // words
    ['symbol',  /[_A-Za-z][-_A-Za-z0-9:',.]*/],  // TODO ew
  ];

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
        var kind_and_pat = TOKENS[i];
            kind = kind_and_pat[0],
            pat  = kind_and_pat[1];
        var m = pat.exec(remain);
        if (m && m.index == 0) {
          var text = m[0];
          var value = m[1] || m[0];
          break;
        }
      }
      if (i === TOKENS.length) {
        tokens.push(new Token('error', remain, "Unkown token"));
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
        if (token.isPartial) {
          return this.value.indexOf(token.value) === 0;
        } else {
          return this.value === token.value;
        }
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

   
  /* define Scratch blocks */

  var categoriesById = {
    1:  "motion",
    2:  "looks",
    3:  "sound",
    4:  "pen",
    5:  "events",
    6:  "control",
    7:  "sensing",
    8:  "operators",
    9:  "variable",
    10: "custom",
    11: "parameter",
    12: "list",
    20: "extension",
    42: "grey",
  };

  var blocks = [];
  var blocksBySelector = {};

  var inputPat = /(%[a-zA-Z](?:\.[a-zA-Z]+)?)/g;

  scratchCommands.push(["%m.var", "r", 9, "readVariable"]);
  scratchCommands.push(["%m.list", "r", 12, "contentsOfList:"]);
  scratchCommands.push(["%m.param", "r", 11, "getParam"]); // TODO
  scratchCommands.push(["else", " ", 6, "<else>"]);
  scratchCommands.push(["end", " ", 6, "<end>"]);
  scratchCommands.push(["...", " ", 42, "<ellipsis>"]);

  var typeShapes = {
    " ": "stack",
    "b": "predicate",
    "c": "cap",
    "e": "if-else",
    "f": "c-block", // TODO
    "h": "hat",
    "r": "reporter",
    "cf": "c-block",
  };

  scratchCommands.forEach(function(command) {
    if (command[0] === "--" || command[0] === "-") return;
    var block = {
      spec: command[0],
      parts: command[0].split(inputPat),
      shape: typeShapes[command[1]], // /[ bcefhr]|cf/
      category: categoriesById[command[2] % 100],
      selector: command[3],
      defaults: command.slice(4),
    };
    blocks.push(block);
    blocksBySelector[block.selector] = block;
  });

  blocksBySelector['*'].display = '×';
  blocksBySelector['/'].display = '÷';


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

  function stringParam(a) {
    a.category = "parameter";
    return {arg: "s", name: a.value};
  }

  function variableDefinition(a, b, c) {
    return {name: a, value: c};
  }

  function listItems(a, b, c) {
    // warning: mutates arguments
    a.category = c.category = "list";
    return b;
  }

  var defineGrammar = new Grammar([
      Rule("line", ["define", "spec-seq"], second),
      Rule("line", ["var-name", "var=", "value"], variableDefinition),
      Rule("line", ["list-name", "list=", "items"], variableDefinition),

      Rule("define", [["define"]], paintLiteral("custom")),

      Rule("spec-seq", ["spec-seq", "spec"], push),
      Rule("spec-seq", ["spec"], box),

      Rule("spec", [{kind: 'symbol'}], paintLiteral("custom")),
      Rule("spec", [{kind: 'lparen'}, "arg-words", {kind: 'rparen'}], param),
      Rule("spec", [{kind: 'langle'}, "arg-words", {kind: 'rangle'}], param),
      Rule("spec", [{kind: 'lsquare'}, "arg-words", {kind: 'rsquare'}], param),

      Rule("arg-words", ["word-seq"], paintList("parameter")),
      Rule("word-seq", ["word-seq", "word"], push),
      Rule("word-seq", ["word"], box),
      Rule("word", [{kind: 'symbol'}], identity),

      Rule("var-name", ["word-seq"], paintList("variable")),
      Rule("var=", [["="]], paintLiteral("variable")),
      Rule("list-name", ["word-seq"], paintList("list")),
      Rule("list=", [["="]], paintLiteral("list")),
      Rule("sep", [[","]], paintLiteral("list")),

      Rule("items", [{kind: 'zero'}], constant([])), // "()"
      Rule("items", [{kind: 'lparen'}, "value-seq", {kind: 'rparen'}],
               listItems),
      Rule("value-seq", ["value-seq", "sep", "value"], push2),
      Rule("value-seq", ["value"], box),

      Rule("value", [{kind: 'number'}], literal),
      Rule("value", [{kind: 'string'}], literal),
  ]);

  // TODO don't match lines containing `=`!


  /* Core grammar */

  var Block = function(info, args, tokens) {
    this.info = info;
    this.args = args;
    this.tokens = tokens;
  }

  function block(selector) {
    var indexes = [].slice.apply(arguments, [1]);
    var info = blocksBySelector[selector];
    assert(info);
    return blockArgs.apply(null, [info].concat(indexes));
  }

  function blockArgs(info) {
    var indexes = [].slice.apply(arguments, [1]);
    var func = function() {
      var funcArgs = [].slice.apply(arguments);
      var args = indexes.map(function(i) {
        var arg = funcArgs[i];
        if (arg.embed) {
          arg = arg.embed.map(function(x) { return x.value; }).join(" ");
        }
        arg = arg.value || arg;
        return arg;
      });

      var tokens = [];
      funcArgs.forEach(function(value) {
        if (value && value.embed) {
          tokens = tokens.concat(value.embed);
        } else {
          if (value.kind === 'symbol' && info.display) {
            value.display = info.display;
          }
          tokens.push(value);
        }
      });

      return new Block(info, args, tokens);
    };
    func._info = info;
    return func;
  }

  function infix(info) {
    return blockArgs(blocksBySelector[info], 0, 2);
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
    return color;
  }

  function unaryMinus(a, b) {
    // warning: mutates arguments
    a.category = 'number';
    return -num(b);
  }

  /* Precedence
   *
   * Loosely, it works like this:
   *
   *  [loosest]
   *              stack blocks              eg. move … steps
   *              numeric reporter blocks   eg. sin of …
   *              arithmetic                eg. + -
   *                                        eg. * /
   *              simple reporters          eg. x position
   *  [tightest]
   *
   * The actual concrete implementation of this is rather messy, and you don't
   * want to think about it. Honest.
   *
   * --I'm serious! That whole bit about "right-reporter" is really just a
   * trick to make arguments greedy. You never understood how it worked; don't
   * try now.
   *
   *  9. [stack blocks]
   *  8. and, or
   *  7. not
   *  6. <, >, =, [other predicates]
   *  5. 
   *  4. +, -  [infix]
   *  3. *, /
   *  2. 
   *  1. // [variables, reporters with no inputs]
   *  0. (literals, brackets)
   *
   */

  var g = new Grammar([
    Rule("line", ["block"], identity),
    Rule("line", ["block", {kind: 'comment'}], first),
    Rule("line", [{kind: 'comment'}], constant(undefined)),

    /* --------------------------------------------------------------------- */

    // there are lots of "block" rules
    // which use the inputs:  "n", "sb", "b", "c"
    //
    // they also have menu inputs, some of which accept reporters,
    // so they use the production "sb"

    /* --------------------------------------------------------------------- */

    Rule("n", ["n5"], identity),
    Rule("n", ["b2"], identity),

    Rule("sb", ["s"], identity),
    Rule("sb", ["b0"], identity),

    Rule("b", ["b8"], identity),

    Rule("c", ["r-parens"], identity),
    Rule("c", ["c0"], identity),

    /* --------------------------------------------------------------------- */

    Rule("s", ["value"], identity),
    Rule("s", ["s0"], identity),

    Rule("value", ["reporter"], identity),
    Rule("value", ["n5"], identity),

    Rule("r-parens", [{kind: 'lparen'}, "r-value", {kind: 'rparen'}], brackets),

    Rule("r-value", ["reporter"], identity),
    Rule("r-value", ["n5"], identity),
    Rule("r-value", ["b8"], identity),
    // TODO: disallow literals from inside parens?

    Rule("b-parens", [{kind: 'langle'}, "b8", {kind: 'rangle'}], brackets),

    // ---

    // There are some "reporter" and a few "predicate" rules
    // which have no expression-accepting inputs.

    //       . . .     "simple-reporter"
    Rule("predicate", ["simple-predicate"], identity),

    // The rest get defined here, because I like my sanity.

    Rule("reporter", ["join"], identity),

    Rule("join", [["join"], "jpart", "jpart"],
                                            block("concatenate:with:", 1, 2)),

    Rule("jpart", ["s0"], identity),
    Rule("jpart", ["join"], identity),
    Rule("jpart", ["r-parens"], identity),
    Rule("jpart", ["b-parens"], identity),

    // "join" on the LHS of a comparison is *confusing*

    Rule("predicate", [["touching"], ["color"], "c", ["?"]],
                                            block("touchingColor:", 2)),
    Rule("predicate", [["color"], "c", ["is"], ["touching"], "c", ["?"]],
                                            block("color:sees:", 1, 4)),

    /* --------------------------------------------------------------------- */

    // all the reporters which are right-recursive

    Rule("right-reporter", [["round"], "n5"], block("rounded", 1)),
    Rule("right-reporter", [["round"], "n5"], block("rounded", 1)),
    Rule("right-reporter", [["length"], ["of"], "s"],
                                          block("stringLength:", 2)),
    Rule("right-reporter", ["m_mathOp", ["of"], "n5"],
                                          infix("computeFunction:of:")),
    Rule("right-reporter", [["pick"], ["random"], "n5", ["to"], "n5"],
                                          block("randomFrom:to:", 2, 4)),
    Rule("right-reporter", [["letter"], "n", ["of"], "s"],
                                          block("letter:of:", 1, 3)),
    Rule("right-reporter", ["m_attribute", ["of"], "m_spriteOrStage"],
                                          block("getAttribute:of:", 0, 2)),
    Rule("right-reporter", [["distance"], ["to"], "m_spriteOrMouse"],
                                          block("distanceTo:", 2)),

    // ---

    Rule("n5", ["right-reporter"], identity),
    Rule("n5", ["n4"], identity),

    Rule("n4", ["n3", ["+"], "n4"], infix("+")),
    Rule("n4", ["n4", ["-"], "n3"], infix("-")), // left-recursive! :D
    Rule("n4", ["n3", ["+"], "right-reporter"], infix("+")),
    Rule("n4", ["n3", ["-"], "right-reporter"], infix("-")),
    Rule("n4", ["n2", ["*"], "right-reporter"], infix("*")),
    Rule("n4", ["n2", ["/"], "right-reporter"], infix("/")),
    Rule("n4", ["n2", ["mod"], "right-reporter"], infix("%")),
    Rule("n4", ["n3"], identity),

    Rule("n3", ["n2", ["*"], "n3"], infix("*")),
    Rule("n3", ["n3", ["/"], "n2"], infix("/")), // left-recursive! :D
    Rule("n3", ["n2", ["mod"], "n3"], infix("%")),
    Rule("n3", ["n2"], identity),

    Rule("n2", ["simple-reporter"], identity),
    Rule("n2", ["r-parens"], identity),
    Rule("n2", ["n0"], identity),

    // ---

    Rule("b8", ["b8", ["and"], "b7"], infix("&")),
    Rule("b8", ["b8", ["or"], "b7"], infix("|")),
    Rule("b8", ["b7"], identity),

    Rule("b7", [["not"], "b7"], block("not", 1)),
    Rule("b7", ["b6"], identity),

    // nb.  "<" and ">" do not tokenize as normal symbols
    Rule("b6", ["s", {kind: 'langle'}, "s"], infix("<")),
    Rule("b6", ["s", {kind: 'rangle'}, "s"], infix(">")),
    Rule("b6", ["s", ["="], "s"], infix("=")),
    Rule("b6", ["m_list", ["contains"], "s"], infix("list:contains:")),
    Rule("b6", ["predicate"], identity),
    Rule("b6", ["b2"], identity),

    Rule("b2", ["b-parens"], identity),
    Rule("b2", ["b0"], identity),

    /* --------------------------------------------------------------------- */

    Rule("n0", [["-"], {kind: 'number'}], unaryMinus),
    Rule("n0", [{kind: 'number'}], num),
    Rule("n0", [{kind: 'empty'}], constant("")),

    Rule("s0", [{kind: 'string'}], literal),

    Rule("b0", [{kind: 'false'}], identity), // "<>"

    Rule("c0", [{kind: 'color'}], literal),

    /* --------------------------------------------------------------------- */

    Rule("@greenFlag", [["flag"]], paint("green")),
    Rule("@greenFlag", [["green"], ["flag"]], paint("green")),
    Rule("@greenFlag", [["⚑"]], paint("green")),

    Rule("@turnLeft",  [["ccw"]], identity),
    Rule("@turnLeft",  [["left"]], identity),
    Rule("@turnLeft",  [["↺"]], identity),

    Rule("@turnRight", [["cw"]], identity),
    Rule("@turnRight", [["right"]], identity),
    Rule("@turnRight", [["↻"]], identity),

  ], ["SpriteVariable", "SpriteList", "AnyVariable", "BlockParam"]);

  var coreGrammar = g.copy();

  // TODO: parse +'s as variable arity, so we can "balance" the trees later on

  // TODO: ellipsis? ellipsis?

  /* Color literals */


  Object.keys(colors).forEach(function(name) {
    g.addRule(Rule("c0", [{kind: 'symbol', value: name}], colorLiteral));
  });

  /* Menu options */

  var menus = ['attribute', 'backdrop', 'broadcast', 'costume', 'effect',
      'key', 'list', 'mathOp', 'rotationStyle', 'scene', 'sound', 'spriteOnly',
      'spriteOrMouse', 'spriteOrStage', 'stageOrThis', 'stop', 'timeAndDate',
      'touching', 'triggerSensor', 'var', 'varName', 'videoMotionType',
      'videoState'];

  var numberMenus = ["direction", "drum", "instrument", "listDeleteItem",
      "listItem", "note"];

  var menusThatAcceptReporters = ['broadcast', 'costume', 'backdrop', 'scene',
      'sound', 'spriteOnly', 'spriteOrMouse', 'spriteOrStage', 'touching'];

  var menuOptions = {
    'attribute': ['x position', 'y position', 'direction', 'costume #',
    'size', 'volume'],
    'backdrop': [],
    'booleanSensor': ['button pressed', 'A connected', 'B connected',
    'C connected', 'D connected'],
    'broadcast': [],
    'costume': [],
    'effect': ['color', 'fisheye', 'whirl', 'pixelate', 'mosaic',
    'brightness', 'ghost'],
    'key': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'a', 'b', 'c', 'd', 'e', 'f', 'g',
      'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u',
      'v', 'w', 'x', 'y', 'z', 'space', 'left arrow', 'right arrow',
      'up arrow', 'down arrow'],
    'list': [],
    'listDeleteItem': ['last', 'all'],
    'listItem': ['last', 'random'],
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

  menus.forEach(function(name) {
    if (menusThatAcceptReporters.indexOf(name) > -1) {
      g.addRule(Rule("m_" + name, ["sb"], identity));
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
        g.addRule(Rule("m_" + name, symbols, embed));
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

  g.addRule(Rule("m_attribute", ["AnyVariable"], identity));
  g.addRule(Rule("m_var", ["SpriteVariable"], identity));
  g.addRule(Rule("m_varName", ["SpriteVariable"], identity));
  g.addRule(Rule("m_list", ["SpriteList"], identity));
  // g.addRule(Rule("m_spriteOnly", ["AnyName"], identity));
  // g.addRule(Rule("m_spriteOrMouse", ["AnyName"], identity));
  // g.addRule(Rule("m_spriteOrStage", ["AnyName"], identity));
  // g.addRule(Rule("m_touching", ["AnyName"], identity));

   

  /* Add rules for blocks */

  var alreadyDefined = [
    "letter:of:", "concatenate:with:",

    "&", "|", "not",
    "=", "<", ">", "list:contains:",

    "randomFrom:to:", "stringLength:", "rounded", "computeFunction:of:",
    "getAttribute:of:", "distanceTo:",

    "*", "/", "%",
    "+", "-", 
  ];

  var doneSpecs = {};
  foo = [
    blocksBySelector['say:'],
    blocksBySelector['think:'],
    blocksBySelector['%'],
  ]
  foo = blocks;
  foo.forEach(function(block) {
    if (alreadyDefined.indexOf(block.selector) > -1) return;
    if (doneSpecs[block.spec]) return;
    doneSpecs[block.spec] = true;

    var symbols = [];
    var argIndexes = [];

    block.parts.forEach(function(part, i) {
      var m = inputPat.exec(part);
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

    if (block.selector === "readVariable") {
      symbols = ["SpriteVariable"];
    } else if (block.selector === "contentsOfList:") {
      symbols = ["SpriteList"];
    } else if (block.selector === "getParam") {
      symbols = ["BlockParam"];
    }

    assert(symbols.length);

    var type = (block.shape === "reporter" ? "simple-reporter" :
                block.shape === "predicate" ? "simple-predicate" : "block");
    g.addRule(Rule(type, symbols,
                       blockArgs.apply(null, [block].concat(argIndexes))));
  });


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
    var symbols = textSymbols(result.name);
    var kind;
    if (result.value instanceof Array) {
      grammar.addRule(new Rule("SpriteList", symbols, embed));
      kind = 'list';
    } else {
      grammar.addRule(new Rule("AnyVariable", symbols, embed));
      grammar.addRule(new Rule("SpriteVariable", symbols, embed));
      kind = 'variable';
    }
    return {
      kind: 'list',
      name: result.name,
      value: result.value,
    };
  }

  function addCustomBlock(grammar, result) {
    var symbols = [];
    var parts = [];
    var argIndexes = [];
    result.forEach(function(x) {
      if (x.arg) {
        argIndexes.push(symbols.length);
        symbols.push(x.arg);
        parts.push("%" + x.arg);
        grammar.addRule(new Rule("BlockParam", textSymbols(x.name),
                            paintLiteral("parameter")));
      } else {
        symbols.push([x]);
        parts.push(x);
      }
    });
    var spec = parts.join(" ");

    var info = {
      isCustom: true,
      spec: spec,
      parts: spec.split(inputPat),
      category: "custom",
    };

    grammar.addRule(new Rule("block", symbols,
                        blockArgs.apply(null, [info].concat(argIndexes))));
    return info;
  }


  /* for c-blocks and `end`s */

  // TODO: shape of "stop" block for "other scripts in sprite"?

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

  var typeShapes = {
    " ": "stack",
    "c": "cap",
    "e": "if-else",
    "f": "c-block", // TODO
    "h": "hat",
    "cf": "c-block",
  };


  /* foo */

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
  };

}(Earley));

