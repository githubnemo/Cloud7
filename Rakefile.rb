require './rake-tools/rainbow.rb'
require './rake-tools/util.rb'

include Util

task :default => [ "build:all" ]

$root_dir = Dir.pwd
$temp_dir = Dir.pwd + "/_temp"



task :init do
  if not File.directory?($temp_dir)
    notice "Creating temporary directory '#{$temp_dir}'"
    Dir.mkdir($temp_dir)
    throw "Temp directory could not be created" unless File.directory?($temp_dir)
  end

  notice "Changing (back) to '#{$temp_dir}'"
  Dir.chdir($temp_dir)
end

namespace :build do

  task :node => :init do
    msg "Downloading node source"
    doSystem('wget http://nodejs.org/dist/node-latest.tar.gz') unless
      File.exists?("node-latest.tar.gz")

    # Only extract if necessary
    if getNodeDir().nil?
      msg "Extracting node"
      doSystem('tar -xzf node-latest.tar.gz')
    end

    node_dir = getNodeDir()
    notice "Changing to '#{node_dir}'"
    Dir.chdir( node_dir )

    if File.exist?('./node')
      notice "node already built, NOT rebuilding"
    else
      applyPatch("./deps/libev/wscript", "#{$root_dir}/rake-tools/patches/libev_wscript.patch")

      %[make clean] # Clean up. This cannot go with the next cmd, because this may fail if
                    # project is not configured.

      msg "Building node.js and libev"
      doSystem('CXXFLAGS="-fPIC" CFLAGS="-fPIC" python tools/waf-light configure build')
    end

    $node_dir = node_dir

    Dir.chdir('../')
  end

  task :libcage => [ :init, :node ] do
    msg "Building libcage"

    doSystem('git clone git://github.com/githubnemo/libcage.git libcage') unless
      File.directory?('libcage')

    notice "Changing to ./libcage/"
    Dir.chdir( './libcage/' )

    requirement('omake', :binary)
    requirement('boost_random-mt', :library)

    applyPatch("./OMakefile", "#{$root_dir}/rake-tools/patches/libcage_omakefile.patch")

    node_dir = getNodeDir()
    doSystem("omake CXXFLAGS='-I#{node_dir}/deps/libev/ -fPIC' LDFLAGS='#{node_dir}/build/default/deps/libev/ev_1.o #{node_dir}/build/default/deps/libev/event_1.o' EV=TRUE")
  end

  task :all => [ :init, :node, :libcage ] do

    msg "All stuff built."

  end

end # Namespace :build



task :clean do
  node_dir = getNodeDir()
  doSystem("cd #{node_dir}; make clean")
  doSystem("cd #{$temp_dir}/libcage; make clean")
end