tosh
====

tosh is a **text-based editor for Scratch projects**. **[Try it out!](http://tosh.tjvr.org/)**


Code
----

This is the open-source version of tosh.

It's the same code used to power [the web app](http://tosh.tjvr.org/) and [the Mac app](http://tosh.tjvr.org/mac/).


Contributing
------------

The best ways of contributing to tosh are:

- **Find bugs**, and report them as issues. But please don’t be offended if I don't prioritise your issue; there are lots of things to do, and I don't have much time to do them.

- **[Buy the Mac app](http://tosh.tjvr.org/mac/)**, or **[donate directly](http://tosh.tjvr.org/donate/)**. This helps to support hosting and development costs, and gives me more time to spend working on tosh!

If you're a JavaScript programmer, you can help by fixing issues yourself and sending me a pull request.


Development
-----------

Clone this repository, and run a test HTTP server:

    $ python3 -m http.server 8888

Browse to <http://localhost:8888/> to try out your copy of tosh. You can edit the code and refresh to see your changes.

Before sending a pull request, make sure you understand the following:

- This project has specific design constraints: you can read more about the design [on my blog](http://tjvr.org/scratch-is-cool/). In particular, I don't want to break compatibility with Scratch.

- I'm very busy, so please be patient while I respond or review your code.

- Don’t be offended if I don’t accept it! I have pretty specific requirements about code style and quality for this project. Your efforts are still appreciated, believe me :-)

Thanks for your help!


License
-------

tosh is released under the [3-clause BSD license](http://choosealicense.com/licenses/bsd-3-clause/); see the LICENSE file for details.

Feel free to read the code, learn from it, contribute code back, and release modified versions. However, I politely request that you seek my permission before distributing tosh to a new platform or operating system; and that if you create a modified version, you do not use the name "tosh". Have fun!

