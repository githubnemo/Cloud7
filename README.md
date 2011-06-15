Very very early development.

core.js currently contains simple testing code of what our core might look like, if we decide to implement it using [Node.js](http://www.nodejs.org). You can use it like this:

	$ node core.js &
	$ nc 127.0.0.1 8124
	{ "method": "echo", "params": ["Hello JSON-RPC"], "id": 1}
	magie:Hello JSON-RPC 1

## Building on Ubuntu

This should build Cloud7 on Ubuntu. If you encounter any errors, run `rake verbose=1` instead of `rake` and let us know where the problem happens.

    $ sudo apt-cache update
    $ sudo git apt-get install libssl-dev zlib1g-dev omake omake-doc libboost-all-dev
    $ git clone git://github.com/x3ro/Cloud7.git
    $ cd Cloud7
    $ rake
    ...
    All stuff built.
    $

## Requirements for building Cloud7 on Windows

    * OpenSSL
    * make
    * wget
    * patch (Util/patch)
    * ocaml
    * ocaml-base
    * libncurses-devel
    * lib-boost
    * ruby
    * rubygems <- not in cygwin
    * rage <- not in cygwin, via rubygems
    * omake <- not in cygwin


### 2. Installing rubygems

Once you have installed ruby via the cygwin installer, download the latest rubygems package from [here](http://rubygems.org/pages/download). The command for me was:

    $ wget http://production.cf.rubygems.org/rubygems/rubygems-1.7.2.tgz
    $ tar -xzf rubygems-1.7.2.tgz
    $ cd rubygems
    $ ruby setup.rb

### 3. Installing rake

Now install rake using rubygems like this:

    $ gem install rake


### 4. Compile omake

Unfortunately omake is not available for Cygwin and libcage uses it, so we have to compile it ourselves:

    $ wget http://omake.metaprl.org/downloads/omake-0.9.8.6-0.rc1.tar.gz
	$ tar -xvzf omake-0.9.8.6-0.rc1.tar.gz
	$ cd omake-0.9.8.6
	# Edit lib/build/OCaml.om and uncomment -warn-error in public.OCAMLFLAGS
	$ make install

### 4. Start building

Clone the Cloud7 project from GitHub and run rake. If you encounter any errors, run `rake verbose=1` instead of `rake` and let us know where the problem happens.

    $ git clone git://github.com/x3ro/Cloud7.git
    $ cd Cloud7
    $ rake
