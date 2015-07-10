var Compiler = (function() {

  function generate(scripts) {
    return scripts.map(function(x) {
      var blocks = x[2]; // x, y, blocks



      return lines.join('\n');
    }).join('\n\n');
  }

  /***************************************************************************/

  function compile(lines) {
    var scriptBlocks = compileFile(lines);
    console.log(JSON.stringify(scriptBlocks).replace(/],/g, "],\n"));
    
    var y = 10;
    var scripts = scriptBlocks.map(function(blocks) {
      var script = [10, y, blocks];
      y += measureScript(blocks) + 10;
      return script;
    });

    return scripts;
  }



  /* line-level parser */

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
    // assert(lines[0].info.shape === 'hat');
    var first = compileBlock(lines, true);
    var blocks = compileBlocks(lines, true);
    blocks.splice(0, 0, first);
    return blocks;
  }

  function compileBlocks(lines, maybeEmpty) {
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
            if (!maybeEmpty) {
              assert(result.length, "Empty c-block mouth");
            }
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
          break;
      case 'hat':
        if (maybeHat) {
          block = lines.shift();
          selector = block.info.selector;
          args = block.args.map(compileReporter);
          break;
        }
        // FALL-THRU
      default:
        return;
    }
    console.log(selector, args);
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



  /* measure blocks */

  function internalHeight(info) {
    var shape = info.shape;
    if (shape === 'if-block') {
      return 36;
    } else if (/c-block/.test(shape)) {  // any(i.shape === 'stack' for i in bt.inserts):
      return 21;
    } else if (shape === 'stack') {
      return 9;
    } else if (/cap/.test(shape)) {
      if (shape === 'c-block cap') { // "forever"
        return 34;
      } else {
        return 8;
      }
    } else if (shape === 'hat') {
      if (info.selector === 'whenGreenFlag') {
        return 25;
      } else {
        return 18;
      }
    } else if (shape === 'predicate') {
      return 5; // ###
    } else if (shape === 'reporter') {
      return 4; // ###
    }
    throw "internalHeight can't do " + info.selector;
  }

  function noInputs(info) {
    var shape = info.shape;
    if (shape === 'stack') {
      return 16;
    } else if (/cap/.test(shape)) {
      return 16;
    } else if (shape === 'predicate') {
      return 16;
    } else if (shape === 'reporter') {
      return 16; // # TODO
    } else if (shape === 'hat') {
      return emptySlot('readonly-menu');
    }
    throw "noInputs can't do " + info.selector;
  }

  function emptySlot(inputShape) {
    /* For arguments which are literals, menu options, or just empty */
    if (inputShape === 'list') {
      return 12;
    } else if (inputShape === 'number') {
      return 16;
    } else if (inputShape === 'string') {
      return 16; // ###
    } else if (inputShape === 'boolean') {
      return 16; // ###
    } else if (inputShape === 'readonly-menu') {
      return 16; // ###
    } else if (inputShape === 'number-menu') {
      return 16; // ###
    } else if (inputShape === 'color') {
      return 16; // ###
    }
    throw "emptySlot can't do " + inputShape;
  }

  function measureScript(list) {
    return sum(list.map(measureBlock)) - 3 * (list.length - 1);
  }

  function measureBlock(block) {
    // be careful not to pass a list here (or a block to measureScript!)
    var selector = block[0],
        info = Scratch.blocksBySelector[selector],
        args = block.slice(1);
    if (!info) throw "unknown selector: " + selector;

    var internal = internalHeight(info);
    if (selector === 'stop' && args[0] !== 'all' && args[0] !== 'this script') {
      internal += 1;
    }

    var argHeight = 0
    var stackHeight = 0

    if (!info.inputs.length) {
      argHeight = noInputs(info);

    } else { // has inputs
      for (var i=0; i<args.length; i++) {
        var arg = args[i];
        var inputShape = info.inputs[i] ? Scratch.getInputShape(info.inputs[i]) : 'list';
        var nonEmpty = (arg instanceof Array); // note this could be a *block*!
        var foo;
        if (!nonEmpty) foo = emptySlot(inputShape);

        if (inputShape === 'list') {
          // c-mouth
          if (nonEmpty) {
            foo = measureScript(arg);

            // does it end with a cap block?
            var last = arg[arg.length - 1];
            var lastInfo = Scratch.blocksBySelector[last[0]];
            if (lastInfo.shape === 'cap') {
              foo += 3;
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
    return internal + argHeight + stackHeight;
  }


  /***************************************************************************/

  return {
    generate: generate, // scripts[] -> lines[]
    compile: compile,   // lines[] -> scripts[]
  };

}());

