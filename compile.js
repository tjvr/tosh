var Compiler = (function() {

  /* compile: tosh -> AST */

  function compile(lines) {
    var scriptBlocks = compileFile(lines);
    console.log(JSON.stringify(scriptBlocks).replace(/],/g, "],\n"));

    var y = 10;
    var scripts = scriptBlocks.map(function(blocks, index) {
      var script = [10, y, blocks];
      var height = measureList(blocks);
      y += height + 10;
      return script;
    });

    return scripts;
  }



  // line-level parser

  function Stream(seq) {
    this.seq = seq;
  }
  Stream.prototype.token = function() {
    return this.seq[0];
  }
  Stream.prototype.next = function() {
    this.shift();
  }

  function compileFile(lines) {
    lines.push({info: {shape: 'eof'}});
    var scripts = [];
    while (true) {
      switch (lines[0].info.shape) {
        case 'blank':
          lines.shift();
          break;
        case 'eof':
          return scripts;
        default:
          scripts.push(compileScript(lines));
          switch (lines[0].info.shape) {
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

  function compileBlank(lines, isRequired) {
    if (isRequired) {
      assert(lines[0].info.shape === 'blank');
      lines.shift();
    }
    while (true) {
      if (lines[0].info.shape === 'blank') {
        lines.shift();
      } else {
        return;
      }
    }
  }

  function compileScript(lines) {
    switch (lines[0].info.shape) {
      case 'reporter':
      case 'predicate':
        var block = compileReporter(lines.shift());
        return [block];
      default:
        var first = compileBlock(lines, true);
        var blocks = compileBlocks(lines); //, true);
        blocks.splice(0, 0, first);
        return blocks;
    }
  }

  function compileBlocks(lines) {
    var result = [];
    if (lines[0].info.shape === 'ellipsis') {
      lines.shift();
      return [];
    }
    while (true) {
      switch (lines[0].info.shape) {
        case 'cap':
          var block = compileBlock(lines);
          if (block) result.push(block);
          return result;
        default:
          var block = compileBlock(lines);
          if (block) {
            result.push(block);
          } else {
            return result;
          }
      }
    }
  }

  function compileBlock(lines, maybeHat) {
    var selector;
    var args;
    switch (lines[0].info.shape) {
      case 'c-block':
      case 'c-block cap':
        block = lines.shift();
        selector = block.info.selector;
        args = block.args.map(compileReporter);

        args.push(compileBlocks(lines));
        assert(lines[0].info.shape === 'end',
            'Expected "end", not ' + lines[0].info.shape);
        lines.shift();
        break;
      case 'if-block':
        block = lines.shift();
        args = block.args.map(compileReporter);

        args.push(compileBlocks(lines));

        selector = 'doIf';
        switch (lines[0].info.shape) {
          case 'else':
            selector = 'doIfElse';
            lines.shift();

            args.push(compileBlocks(lines));

            // FALL-THRU
          case 'end':
            assert(lines[0].info.shape === 'end',
                'Expected "end", not ' + lines[0].info.shape);
            lines.shift();
            break;
          default:
            assert(false, 'Expected "else" or "end", not ' + lines[0].info.shape);
        }
        break;
      case 'cap':
      case 'stack':
          block = lines.shift();
          selector = block.info.selector;
          args = block.args.map(compileReporter);
          if (block.info.isCustom) {
            return ['call', block.info.spec].concat(args);
          }
          break;
      case 'hat':
        if (maybeHat) {
          block = lines.shift();
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
    return scripts.map(function(x) {
      var blocks = x[2]; // x, y, blocks
      return generateList(blocks).join('\n');
    }).join('\n\n') + '\n';
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
      var result = 'define ' + (isAtomic ? 'atomic ' : '')
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
        // TODO generate color literals
        return value;
      case 'boolean':
        if (!value) return '<>';
        assert(false, 'literal non-false booleans not allowed: ' + value);
      case 'readonly-menu':
        switch (value) {
          case '_mouse_':  return 'mouse-pointer';
          case '_myself_': return 'myself';
          case '_Stage_':  return 'Stage';
        }
        if (Language.menusThatAcceptReporters.indexOf(menu) > -1) {
          // treat as string
        } else {
          return value;
        }
        // FALL-THRU
      case 'string':
        if (!value && level < +Infinity && level !== -1) {
          return '_';
        }
        // Does it look like a number?
        if (/-?[0-9]+\.?[0-9]*/.test(value)) {
          return '' + value;
        }
        value = value || "";
        return '"' + value.replace(/"/g, '\\"')
                           .replace(/\\/g, '\\\\') + '"';
      case 'number':
        if (!value && value !== 0) return '_';
        return (value || 0);
      default:
        // TODO
        return value;
    }
  }

  function indent(lines) {
    return lines.map(function(x) { return '\t' + x; });
  }


  /***************************************************************************/


  return {
    generate: generate, // AST -> tosh
    compile: compile,   // tosh -> AST
    _measure: measureList, // internal to compile()
  };

}());

