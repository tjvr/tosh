var Compiler = (function() {

  /* compile: tosh -> AST */

  function compile(lines) {
    lines.push({info: {shape: 'eof'}});
    var stream = new Stream(lines);
    var scriptBlocks = compileFile(stream);
    // console.log(JSON.stringify(scriptBlocks).replace(/],/g, "],\n")); //
    // DEBUG

    var y = 10;
    var scripts = scriptBlocks.map(function(blocks, index) {
      var script = [10, y, blocks];
      var height = measureList(blocks);
      y += height + 10;
      return script;
    });

    return scripts;
  }


  function Stream(lines) {
    this.lines = lines;
  }
  Stream.prototype.peek = function() {
    var value = this.lines[0];
    assert(value);
    return value;
  };
  Stream.prototype.shift = function() {
    var value = this.lines.shift();
    while (this.lines.length && !this.lines[0]) {
      this.lines.shift(); // skip comments
    }
    return value;
  };



  // line-level parser

  function compileFile(stream) {
    var scripts = [];
    while (true) {
      switch (stream.peek().info.shape) {
        case 'blank':
          stream.shift();
          break;
        case 'eof':
          return scripts;
        default:
          scripts.push(compileScript(stream));
          switch (stream.peek().info.shape) {
            case 'blank':
              break;
            case 'eof':
              return scripts;
            default:
              assert(false);
          }
      }
    }
  }

  function compileBlank(stream, isRequired) {
    if (isRequired) {
      assert(stream.peek().info.shape === 'blank');
      stream.shift();
    }
    while (true) {
      if (stream.peek().info.shape === 'blank') {
        stream.shift();
      } else {
        return;
      }
    }
  }

  function compileScript(stream) {
    switch (stream.peek().info.shape) {
      case 'reporter':
      case 'predicate':
        var block = compileReporter(stream.shift());
        return [block];
      default:
        var first = compileBlock(stream, true);
        var blocks = compileBlocks(stream); //, true);
        blocks.splice(0, 0, first);
        return blocks;
    }
  }

  function compileBlocks(stream) {
    var result = [];
    if (stream.peek().info.shape === 'ellipsis') {
      stream.shift();
      return [];
    }
    while (true) {
      switch (stream.peek().info.shape) {
        case 'cap':
        case 'c-block cap':
          var block = compileBlock(stream);
          if (block) result.push(block);
          return result;
        default:
          var block = compileBlock(stream);
          if (block) {
            result.push(block);
          } else {
            return result;
          }
      }
    }
  }

  function compileBlock(stream, maybeHat) {
    var selector;
    var args;
    switch (stream.peek().info.shape) {
      case 'c-block':
      case 'c-block cap':
        block = stream.shift();
        selector = block.info.selector;
        args = block.args.map(compileReporter);

        args.push(compileBlocks(stream));
        assert(stream.peek().info.shape === 'end',
            'Expected "end", not ' + stream.peek().info.shape);
        stream.shift();
        break;
      case 'if-block':
        block = stream.shift();
        args = block.args.map(compileReporter);

        args.push(compileBlocks(stream));

        selector = 'doIf';
        switch (stream.peek().info.shape) {
          case 'else':
            selector = 'doIfElse';
            stream.shift();

            args.push(compileBlocks(stream));

            // FALL-THRU
          case 'end':
            assert(stream.peek().info.shape === 'end',
                'Expected "end", not ' + stream.peek().info.shape);
            stream.shift();
            break;
          default:
            assert(false, 'Expected "else" or "end", not ' + stream.peek().info.shape);
        }
        break;
      case 'cap':
      case 'stack':
          block = stream.shift();
          selector = block.info.selector;
          args = block.args.map(compileReporter);
          if (block.info.isCustom) {
            return ['call', block.info.spec].concat(args);
          }
          break;
      case 'hat':
        if (maybeHat) {
          block = stream.shift();
          selector = block.info.selector;
          args = (selector === 'procDef') ? block.args.slice()
                                          : block.args.map(compileReporter);
          break;
        }
        // FALL-THRU
      default:
        return;
    }
    return [selector].concat(args);
  }

  function compileReporter(b) {
    if (b.info) {
      return [b.info.selector].concat(b.args.map(compileReporter));
    } else if (b.value) { // ie. a token
      return b.value;
    } else {
      return b;
    }
  }


  /***************************************************************************/

  /* measure: AST -> height in pixels */

  var measureLog = function(message) {};

  function internalHeight(info) {
    var shape = info.shape;
    switch (shape) {
      case 'if-block':    return 36;
      case 'c-block cap': return 34; // "forever"
      case 'cap':         return 8;
      case 'c-block':     return 21;
      case 'stack':       return 9;
      case 'hat':         return (info.selector === 'whenGreenFlag') ? 25
                               : 18;
      case 'predicate':   return 5; // ###
      case 'reporter':    return 4; // ###
    }
    throw "internalHeight can't do " + info.selector;
  }

  function noInputs(info) {
    var shape = info.shape;
    switch (shape) {
      case 'stack':       return 16;
      case 'cap':
      case 'c-block cap': return 16;
      case 'predicate':   return 16;
      case 'reporter':    return 16; // # TODO
      case 'hat':         return emptySlot('readonly-menu');
    }
    throw "noInputs can't do " + info.selector;
  }

  function emptySlot(inputShape) {
    /* For arguments which are literals, menu options, or just empty */
    switch (inputShape) {
      case 'list':          return 12;
      case 'number':        return 16;
      case 'string':        return 16; // ###
      case 'boolean':       return 16; // ###
      case 'readonly-menu': return 16; // ###
      case 'number-menu':   return 16; // ###
      case 'color':         return 16; // ###
    }
    throw "emptySlot can't do " + inputShape;
  }

  function measureList(list, debug) {
    if (debug) measureLog = debug;
    return sum(list.map(measureBlock)) - 3 * (list.length - 1);
  }

  function blockInfo(block) {
    var selector = block[0],
        args = block.slice(1),
        info;
    switch (selector) {
      case 'call':
        spec = args.shift();
        info = {
          spec: spec,
          parts: spec.split(Scratch.inputPat),
          shape: 'stack',
          category: 'custom',
          selector: null,
          defaults: [], // not needed
        }
        info.inputs = info.parts.filter(function(p) { return Scratch.inputPat.test(p); });
        return info;
      default:
        info = Scratch.blocksBySelector[selector];
        if (!info) throw "unknown selector: " + selector;
        return info;
    }
  }

  function measureBlock(block) {
    // be careful not to pass a list here (or a block to measureList!)
    var selector = block[0],
        args = block.slice(1);
    if (selector === 'procDef') {
      var hasInputs = false,
          hasBooleans = false;
      var spec = args[0];
      spec.split(Scratch.inputPat).forEach(function(part) {
        if (Scratch.inputPat.test(part)) {
          hasInputs = true;
          if (part === '%b') hasBooleans = true;
        }
      });
      return hasBooleans ? 65 : hasInputs ? 64 : 60;
    }
    var info = blockInfo(block);
    if (selector === 'call') {
      args.shift(); // spec
    }

    var internal = internalHeight(info);
    measureLog(internal, "internalHeight", info.selector);
    if (selector === 'stopScripts' &&
        ['all', 'this script'].indexOf(args[0]) === -1) {
      internal += 1;
    }

    var argHeight = 0;
    var stackHeight = 0;

    var hasInputs = (info.inputs.length
                  || /c-block|if-block/.test(info.shape));

    if (!hasInputs) {
      argHeight = noInputs(info);
      measureLog(argHeight, "noInputs", info.shape);

    } else { // has inputs
      for (var i=0; i<args.length; i++) {
        var arg = args[i];
        var inputShape = info.inputs[i] ? Scratch.getInputShape(info.inputs[i])
                                        : 'list';
        var nonEmpty = (arg instanceof Array && arg.length);
                        // note this could be a *block*!
        var foo;
        if (!nonEmpty) {
          foo = emptySlot(inputShape);
          measureLog(foo, "emptySlot", inputShape);
        }

        if (inputShape === 'list') {
          // c-mouth
          if (nonEmpty) {
            foo = measureList(arg);

            // does it end with a cap block?
            var last = arg.slice().pop();
            if (last) {
              var lastInfo = blockInfo(last);
              if (/cap/.test(lastInfo.shape)) {
                foo += 3;
              }
            }
          }
          stackHeight += foo;

        } else {
          // arg
          if (nonEmpty) {
            foo = measureBlock(arg);
          }
          argHeight = Math.max(argHeight, foo);
        }
      }
    }
    var total = internal + argHeight + stackHeight;
    measureLog(total, block);
    return total;
  }


  /***************************************************************************/

  /* generate: AST -> tosh */

  var images = {
    '@greenFlag': 'flag',
    '@turnLeft': 'ccw',
    '@turnRight': 'cw',
  };

  function generate(scripts) {
    var result = scripts.map(function(x) {
      var blocks = x[2]; // x, y, blocks
      return generateList(blocks).join('\n');
    }).join('\n\n');
    // enforce trailing blank line
    if (result && result[result.length - 1] !== '\n') result += '\n';
    return result;
  }

  function generateList(list) {
    var lines = [];
    list.forEach(function(block) {
      lines = lines.concat(generateBlock(block));
    });
    return lines;
  }

  function generateBlock(block) {
    var selector = block[0],
        args = block.slice(1),
        info = Scratch.blocksBySelector[selector];

    if (selector === 'call') {
      var spec = selector = args.shift();
      info = {
        spec: spec,
        parts: spec.split(Scratch.inputPat),
        shape: 'stack',
        category: 'custom',
        selector: null,
        defaults: [], // don't need these
      };
      info.inputs = info.parts.filter(function(p) { return Scratch.inputPat.test(p); });
    } else if (selector === 'procDef') {
      // TODO fix
      var spec = block[1],
          names = block[2].slice(),
          defaults = block[3].slice(), // ignore these
          isAtomic = block[4];
      var result = isAtomic ? 'define-atomic ' : 'define ';
      return result + spec.split(Scratch.inputPat).map(function(part) {
        var m = Scratch.inputPat.exec(part);
        if (m) {
          var inputShape = Scratch.getInputShape(part);
          var name = names.shift();
          switch (inputShape) {
            case 'number':  return '(' + name + ')';
            case 'string':  return '[' + name + ']';
            case 'boolean': return '<' + name + '>';
            default: return part;
          }
        } else {
          return part.split(/ +/g).map(function(word) {
            if (word === '%%') return '%';
            return word;
          }).join(' ');
        }
      }).join('');
    }

    // top-level reporters
    if (info.shape === 'reporter' || info.shape === 'predicate') {
      return generateReporter(block, null, -Infinity);
    }

    var result = generateParts(info, args, +Infinity);

    switch (info.shape) {
      case 'if-block': // if/else?
        var lines = [result];
        lines = lines.concat(generateMouth(args.shift()));
        if (args.length) {
          lines.push('else');
          lines = lines.concat(generateMouth(args.shift()));
        }
        lines.push('end');
        return lines;
      case 'c-block':
      case 'c-block cap':
        var lines = [result];
        lines = lines.concat(generateMouth(args.shift()));
        lines.push('end');
        return lines;
      default:
        return [result];
    }
  }

  function generateMouth(list) {
    var lines = generateList(list || []);
    if (!lines.length) lines = ['...'];
    return indent(lines);
  }

  function generateReporter(block, inputShape, outerLevel, argIndex) {
    var selector = block[0],
        args = block.slice(1),
        info = Scratch.blocksBySelector[selector];

    var level = Language.precedence[selector] || 0;

    var result = generateParts(info, args, level);

    var needsParens = (level > outerLevel
                    || (selector === '|' &&
                        outerLevel === Language.precedence['&'])
                    || (selector === '&' &&
                        outerLevel === Language.precedence['|'])
                    || inputShape === 'color'
                    || (inputShape !== 'boolean' && info.shape === 'predicate')
                    || (level === outerLevel &&
                        ['-', '/', '%'].indexOf(selector) > -1 &&
                        argIndex === 1)
                    || /menu/.test(inputShape)
                      );
    if (needsParens) {
      switch (info.shape) {
        case 'predicate': result = '<' + result + '>'; break;
        default:          result = '(' + result + ')'; break;
      }
    }
    return result;
  }

  function generateParts(info, args, outerLevel) {
    var argIndex = 0;
    var result = [];
    for (var i=0; i<info.parts.length; i++) {
      var part = info.parts[i];
      var m = Scratch.inputPat.exec(part);
      if (m) {
          var inputShape = Scratch.getInputShape(part);
          var value = args.shift();
          var menu = part.split('.').pop();
          if (value instanceof Array) {
            part = generateReporter(value, inputShape, outerLevel, argIndex);
          } else {
            part = generateLiteral(value, inputShape, menu, outerLevel);
          }
          argIndex += 1;
      } else {
        part = part.split(/( +)/g).map(function(word) {
          if (/[:]$/.test(word)) word += ' ';
          return images[word] || word || '';
        }).join('');
      }
      result.push(part);
    }
    return result.join('').replace(/ +/, ' ');
  }

  function generateLiteral(value, inputShape, menu, level) {
    switch (inputShape) {
      case 'color':
        return generateColorLiteral(parseInt(value));
      case 'boolean':
        if (!value) return '<>';
        assert(false, 'literal non-false booleans not allowed: ' + value);
      case 'readonly-menu':
        return generateMenuLiteral(value, menu);
      case 'string':
        // Does it look like a number?
        if (/^-?[0-9]+\.?[0-9]*$/.test(value)) {
          return '' + value;
        }
        return generateStringLiteral(value);
      case 'number':
        // nb. Scratch saves empty number slots as 0
        // so it is always allowable to convert a number slot to zero
        return Number(value) || 0;
      default:
        // TODO
        return value;
    }
  }

  function generateMenuLiteral(value, menu) {
    switch (value) {
      case '_mouse_':  return 'mouse-pointer';
      case '_myself_': return 'myself';
      case '_Stage_':  return 'Stage';
      case '_edge_':  return 'edge';
    }
    if (isStringMenu(menu, value)) {
      return generateStringLiteral(value);
    } else {
      return value;
    }
  }

  function isStringMenu(menu, value) {
    if (Language.menusThatAcceptReporters.indexOf(menu) > -1) {
      return true;
    }
    if (menu === 'attribute' &&
        Language.menuOptions.attribute.indexOf(value) === -1) {
      return true;
    }
    return false;
  }

  function generateStringLiteral(value) {
    value = value || "";
    return '"' + value.replace(/\\/g, '\\\\')
                      .replace(/"/g, '\\"') + '"';
  }

  function generateColorLiteral(number) {
    if (number < 0) number = 0xFFFFFFFF + number + 1;
    var hex = number.toString(16);
    hex = hex.slice(hex.length - 6); // last 6 characters
    while (hex.length < 6) hex = '0' + hex;
    if (hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5]) {
      hex = hex[0] + hex[2] + hex[4];
    }
    return '#' + hex;
  }

  function indent(lines) {
    return lines.map(function(x) { return '\t' + x; });
  }


  /***************************************************************************/

  /* rename a variable */

  // TODO can we abstract out the AST-recursing stuff from generate()?

  function renameInScript(mappingForScript, script) {
    var x = script[0], y = script[1], blocks = script[2];
    mapping = mappingForScript(blocks[0]);
    return [x, y, renameInList(mapping, blocks)];
  }

  function renameInList(mapping, blocks) {
    if (!blocks) return [];
    return blocks.map(renameInBlock.bind(this, mapping));
  }

  function renameInBlock(mapping, block) {
    var args = block.slice();
    var selector = args.shift();
    var proc = selector === 'call' ? args.shift() : null;
    var info = Scratch.blocksBySelector[selector];
    var shape = info ? info.shape : null;

    var lists = [];
    if (/if-block/.test(shape) || selector === 'doIfElse') {
      lists = args.splice(1);
    } else if (/c-block/.test(shape)) {
      lists = args.splice(args.length === 1 ? 0 : 1);
    }

    args = args.map(renameInArg.bind(this, mapping));
    lists = lists.map(renameInList.bind(this, mapping));

    var newArgs = renameInBlockArgs(mapping, selector, args[0], args[1], args[2]);
    if (newArgs) {
      assert(newArgs.length === args.length);
      args = newArgs;
    }

    args = args.concat(lists);

    if (proc) args.splice(0, 0, proc);
    return [selector].concat(args);
  }

  function renameInArg(mapping, value) {
    if (value.constructor === Array) {
      value = renameInBlock(mapping, value);
    }
    return value;
  }

  function renameInBlockArgs(mapping, selector, a, b, c) {
    var renameVar = mapping.bind(this, 'variable');
    var renameList = mapping.bind(this, 'list');
    var renameParameter = mapping.bind(this, 'parameter');

    switch (selector) {
      // variables
      case 'readVariable':
      case 'showVariable:':
      case 'hideVariable:':
        return [renameVar(a)];
      case 'setVar:to:':
      case 'changeVar:by:':
        return [renameVar(a), b];

      // variable on other sprite
      case 'getAttribute:of:':
        if (b instanceof Array) return [a, b];
        return [renameVar(a, b), b];

      // lists
      case 'contentsOfList:':
      case 'showList:':
      case 'hideList:':
      case 'lineCountOfList:':
        return [renameList(a)];
      case 'append:toList:':
      case 'deleteLine:ofList:':
      case 'getLine:ofList:':
        return [a, renameList(b)];
      case 'insert:at:ofList:':
        return [a, b, renameList(c)];
      case 'setLine:ofList:to:':
        return [a, renameList(b), c];
      case 'list:contains:':
        return [renameList(a), b];

      // parameters
      case 'getParam':
        // Assume parameter renaming is deterministic
        // TODO
      case 'procDef':
        // TODO
    }
  }

  /***************************************************************************/


  return {
    generate: generate, // AST -> tosh
    compile: compile,   // tosh -> AST
    renameInScript: renameInScript, // used by format's automatic renaming
    _measure: measureList, // internal to compile()
  };

}());

