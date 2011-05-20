require './rake-tools/rainbow.rb'
require './rake-tools/util.rb'

include Util

task :default => [ "build:all" ]

$root_dir = Dir.pwd
$temp_dir = Dir.pwd + "/_temp"

####
# Initialization
####

task :init do
  requirement('patch', :binary)

  if not File.directory?($temp_dir)
    notice "Creating temporary directory '#{$temp_dir}'"
    Dir.mkdir($temp_dir)
    throw "Temp directory could not be created" unless File.directory?($temp_dir)
  end

  notice "Changing (back) to '#{$temp_dir}'"
  Dir.chdir($temp_dir)
end


####
# Node related
####

namespace :node do

  task :build => :init do
    msg "Downloading node source"

    if ( not File.exists?('node-latest.tar.gz') or not isValidArchive('node-latest.tar.gz') )
      doSystem('wget http://nodejs.org/dist/node-latest.tar.gz')
    end

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


  task :clean do
    node_dir = getNodeDir()

    if Dir.exists?(node_dir)
      Dir.chdir(node_dir)
      doSystem("make clean")
    else
      error "Node directory does not exist yet (#{node_dir})"
    end

  end

end


####
# libcage related
####

namespace :libcage do

  task :build => [ :init, "node:build" ] do
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

  task :clean do
    libcage_dir = "#{$temp_dir}/libcage"
    if Dir.exists?(libcage_dir)
      Dir.chdir(libcage_dir)
      doSystem("make clean")
    else
      error "libcage directory does not exist yet (#{libcage_dir})"
    end
  end

end # Namespace :libcage


####
# Convenience namespace
####

namespace :build do

  task :all => [ :init, "node:build", "libcage:build" ] do
    msg "All stuff built"
  end

  task :clean => [ "node:clean", "libcage:clean" ] do
    msg "Cleaned all targets"
  end

end

