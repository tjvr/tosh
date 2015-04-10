
var Test = (function(Earley) {
    
  function assert(x, message) {
    if (!x) throw new Error("Assertion failed: " + (message || ''));
  }

  /* for tests */

  var numFailures = 0;
  var numTests = 0;

  function assertEqual(x, y, m) {
    m = "Test " + (m ? m + " " : "") + "failed:  ";
    if (JSON.stringify(x) !== JSON.stringify(y)) {
      console.log(m + JSON.stringify(x), "!=", JSON.stringify(y));
      numFailures++;
    }
  }

  var isEnabled = true;
  function off() { isEnabled = false; }
  function on()  { isEnabled = true; }

  function testParse(grammar, input, result) {
    if (!isEnabled) return;
    numTests++;
    var p = new Parser(grammar);
    var tokens = Language.tokenize(input);
    try {
      var results = p.parse(tokens)
    } catch (e) {
      console.log(new Error("Test failed: " + input).stack);
      console.log(e.stack);
      numFailures++;
      return;
    }
    assertEqual(results[0], result);
  }

  function testFail(grammar, input, errorMessage) {
    if (!isEnabled) return;
    numTests++;
    var p = new Parser(grammar);
    var tokens = Language.tokenize(input);
    try {
      var results = p.parse(tokens)
    } catch (e) {
      assertEqual(e.message, errorMessage, "e.message");
      return;
    }
    console.log("Test failed: unexpected success! " +
                JSON.stringify(results[0]));
    numFailures++;
  }



  /* for match()ing tokens */

  var SymbolSpec = function(kind, value) {
    this.kind = kind;
    this.value = value;
  };

  SymbolSpec.prototype.match = function(token) {
    return (this.kind === token.kind
        && (this.value === undefined || this.value === token.value));
  };

  SymbolSpec.prototype.toString = function() {
    switch (this.kind) {
      case "symbol":  return this.value;
      case "lparen":  return "(";
      case "rparen":  return ")";
      case "langle":  return "<";
      case "rangle":  return ">";
      case "false":   return "<>";
      case "comment": return "// ";
    }
  };

  var Spec = function(kind, value) {
    return new SymbolSpec(kind, value);
  };

  var Symbol = function(value) {
    return new SymbolSpec("symbol", value);
  };


  /* for defining grammars */

  var Parser = Earley.Parser;
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


  /* test 1 */

  function boxParens(a, b, c) { return [b]; }
  function empty() { return ""; }

  var g = new Grammar([
    Rule("E", [Spec("lparen"), "E", Spec("rparen")], boxParens),
    Rule("E", [], empty),
  ]);

  testParse(g, "", "");
  testParse(g, "(( ))", [[""]]);
  testFail(g, "((( ");
  testFail(g, "((( ))");


  /* test 2 */

  function identity(x) { return x; }
  function box2(a, b) { return [a, b]; }
  function parens(a, b, c) { return b; }

  var g = new Grammar([
      Rule("S", ["S", "E"], box2),
      Rule("S", ["E"], identity),
      Rule("E", [Spec("lparen"), "E", Spec("rparen")], parens),
      Rule("E", [], empty),
  ]);


  /* test 3 */

  function zeroPrefix(a, b) { return [0, a.value, b]; }
  function infix(a, b, c) { return [a, b.value, c]; }
  function number(a) { return parseInt(a.value); }

  var g = new Grammar([
      Rule("P", ["S"], identity),

      Rule("S", ["S", ["+"], "M"], infix),
      Rule("S", ["S", ["-"], "M"], infix),
      Rule("S", ["M"], identity),

      Rule("M", ["M", ["*"], "T"], infix),
      Rule("M", ["T"], identity),

      Rule("T", [["+"], "N"], zeroPrefix),
      Rule("T", [["-"], "N"], zeroPrefix),
      Rule("T", ["N"], identity),

      Rule("N", [Spec("number")], number),
      Rule("N", [Spec("lparen"), "P", Spec("rparen")], parens),
  ]);

  g.debug = true;
  testParse(g, "2 + 3", [2, "+", 3]);
  testParse(g, "2 + 3 - 4", [[2, "+", 3], "-", 4]);

  testParse(g, "2 * 3 + 4", [[2, "*", 3], "+", 4]);
  testParse(g, "2 + 3 * 4", [2, "+", [3, "*", 4]]);
  testParse(g, "(2 + 3) * 4", [[2, "+", 3], "*", 4]);

  testParse(g, "5 * - 6", [5, "*", [0, "-", 6]]);


  /* test 4 */

  function box(a) { return [a]; }
  function box3(a, b, c) { return [a, b, c]; }
  function literal(a) { return a.value; }

  var g = new Grammar([
      Rule("S", ["NP", "VP"], box2),
      Rule("NP", ["N"], box),
      Rule("VP", ["V", "NP"], box2),
      Rule("VP", ["V", "to", "VP"], box3),

      Rule("N", [Symbol("Dan")], literal),
      Rule("N", [Symbol("beards")], literal),
      Rule("V", [Symbol("like")], literal),
      Rule("V", [Symbol("likes")], literal),
      Rule("to", [Symbol("to")], literal),
  ]);

  testParse(g, "Dan likes beards", [["Dan"], ["likes", ["beards"]]]);
  testParse(g, "beards like Dan", [["beards"], ["like", ["Dan"]]]);
  testParse(g, "Dan likes to like beards", [["Dan"], ["likes", "to", ["like", ["beards"]]]]);
  testFail(g, "Dan", 'Incomplete input. Expected one of: "like", "likes"');
  testFail(g, "Dan likes", 'Incomplete input. Expected one of: "to", "Dan", "beards"');


  /* test 5 */

  // ambiguous grammar

  function poo() { return [].slice.apply(arguments); }

  var g = new Grammar([
      Rule("e", ["e", Symbol("+"), "e"], infix),
      Rule("e", ["n"], identity),
      Rule("n", [Spec("number")], literal),
  ]);

  testParse(g, "1 + 2 + 3");


  /* done */

  console.log(numFailures + " failures out of " + numTests + " tests run.");


  /**************************************************************************/

  // Grammar fuzz testing.

  function choice(list) {
    var index = Math.floor(Math.random() * list.length);
    return list[index];
  }

  function expand(grammar, ruleName) {
    var ruleName = ruleName || grammar.toplevel;
    var rules = grammar.rulesByName[ruleName];
    if (!rules) {
      // switch (ruleName) {
      //   case "AnyVariable":    return "score";
      //   case "SpriteVariable": return "foo";
      //   case "SpriteList":     return "cheeses";
      //   case "BlockParam":     return "height";
      // }
      throw "No rule named " + ruleName;
    }

    if (ruleName == "n4") {
      if (Math.random() < 0.6) {
        return "3.14";
      }
    }
    var rule = choice(rules);

    var words = [];
    for (var i=0; i<rule.symbols.length; i++) {
      var symbol = rule.symbols[i];
      if (typeof symbol === "string") {
        words = words.concat(expand(grammar, symbol));
      } else {
        if (symbol.value) {
          words.push(symbol.value);
        } else {
          var d = {
            "number":  '10',
            "menu":    '[ v]',
            "string":  '"string"',
            "comment": '', //' // comment',
            "lparen":  '(',
            "rparen":  ')',
            "langle":  '<',
            "rangle":  '>',
            "false":   '<>',
            "zero":    '()',
            "color":   '#f0f',
          };
          if (!d.hasOwnProperty(symbol.kind)) throw symbol;
          words.push(d[symbol.kind]);
        }
      }
    }
    return words.join(" ");
  }

  function fuzz(n) {
    var n = n || 100;

    var g = Language.grammar.copy();
    g.addRule(Rule("AnyVariable", [["score"]], literal));
    g.addRule(Rule("SpriteVariable", [["foo"]], literal));
    g.addRule(Rule("SpriteList", [["list"]], literal));
    g.addRule(Rule("BlockParam", [["height"]], literal));

    var lines = []
    for (var i=0; i<n; i++) {
        var text = expand(g);
        lines.push(text);
        new Earley.Parser(g).parse(Language.tokenize(text));
    }
    return lines.join("\n");
  }

  return {
    fuzz: fuzz,
  }

}(Earley));

