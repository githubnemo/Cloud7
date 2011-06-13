require './rake-tools/rainbow.rb'
require './rake-tools/util.rb'

include Util

task :default => [ "install" ]

$root_dir = Dir.pwd
$temp_dir = Dir.pwd + "/_temp"

msg "Verbose mode !" if verboseMode?

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
      applyPatch("./tools/node-waf", "#{$root_dir}/rake-tools/patches/node_waf.patch")
      applyPatch("./tools/wafadmin/Tools/gxx.py", "#{$root_dir}/rake-tools/patches/node_waf_gxx.patch")

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


  task :install => [:init, "node:build"] do
    notice "Removing old node installation from Cloud7 directory"
    FileUtils.rm_rf "#{$root_dir}/node" or
      error("Could not delete '#{$root_dir}/node'")

    node_dir = "#{getNodeDir()}/build/default"


    begin
      FileUtils.cp_r(node_dir, "#{$root_dir}/node")
    rescue Exception => e
      error("Could not copy '#{node_dir}' to '#{$root_dir}'")
    end

    FileUtils.chmod 0755, "#{$root_dir}/node/node"

    msg("Successfully installed node into #{$root_dir}")
  end

end


####
# libcage related
####

namespace :libcage do

  task :build => [ :init, "node:build" ] do
    msg "Building libcage"

    doSystem('env GIT_SSL_NO_VERIFY=true git clone -b master https://github.com/githubnemo/libcage.git libcage') unless
      File.directory?('libcage')

    notice "Changing to ./libcage/"
    Dir.chdir( './libcage/' )

    requirement('omake', :binary)
    requirement('boost_random-mt', :library)

    applyPatch("./OMakefile", "#{$root_dir}/rake-tools/patches/libcage_omakefile.patch")

    node_dir = getNodeDir()
    doSystem("omake CXXFLAGS='-I#{node_dir}/deps/libev/ -fPIC' LDFLAGS='#{node_dir}/build/default/deps/libev/ev_1.o #{node_dir}/build/default/deps/libev/event_1.o' EV=TRUE")

    Dir.chdir('../')
  end


  task :clean do
    libcage_dir = "#{$temp_dir}/libcage"
    if Dir.exists?(libcage_dir)
      Dir.chdir(libcage_dir)
      FileUtils.rm_rf libcage_dir or
        error("Could not delete #{libcage_dir}")
    else
      notice "libcage directory does not exist yet (#{libcage_dir})"
    end

    msg("Successfully cleaned the libcage target")
  end


  task :install => [:init, "libcage:build"] do
    cloud7_peers = "#{$root_dir}/core/lib/peers/"

    notice "Removing old libcage installation from Cloud7 directory"
    FileUtils.rm_rf "#{cloud7_peers}/libcage" or
      error("Could not delete '#{cloud7_peers}/libcage'")


    libcage_dir = "#{$temp_dir}/libcage"

    begin
      FileUtils.cp_r(libcage_dir, cloud7_peers)
    rescue Exception => e
      error("Could not copy '#{libcage_dir}' to '#{cloud7_peers}'")
    end

    msg("Successfully installed libcage into #{cloud7_peers}")
  end


end # Namespace :libcage

namespace :nodedht do

  task :build => [ :init, "libcage:build" ] do
    msg "Building node-dht"

    doSystem('env GIT_SSL_NO_VERIFY=true git clone https://github.com/githubnemo/node-dht.git node-dht') unless
      File.directory?('node-dht')

    notice "Changing to ./node-dht/"
    Dir.chdir( './node-dht/' )

    node_dir = getNodeDir()
    doSystem("export PYTHONPATH=#{node_dir}/tools/wafadmin/:#{node_dir}/tools/wafadmin/Tools ; export PREFIX_NODE=#{node_dir} ; CXXFLAGS='-I#{node_dir}deps/libev -I#{node_dir}/src/ -I#{node_dir}/deps/libeio/ -I#{node_dir}deps/v8/include/ -I#{$root_dir}/_temp/libcage/include/' LINKFLAGS='-L#{$root_dir}/_temp/libcage/src/' #{node_dir}/tools/node-waf configure build -v")

    Dir.chdir( '..' )
  end


  task :clean => [ :init ] do
    Dir.chdir( './node-dht/' )
    doSystem("node-waf clean")
  end


  task :install => [:init, "nodedht:build"] do
    cloud7_peers = "#{$root_dir}/core/lib/peers/"

    notice "Removing old nodedht installation from Cloud7 directory"
    FileUtils.rm_rf "#{cloud7_peers}/node-dht" or
      error("Could not delete '#{cloud7_peers}/libcage'")


    nodedht_dir = "#{$temp_dir}/node-dht"

    begin
      FileUtils.cp_r(nodedht_dir, cloud7_peers)
    rescue Exception => e
      error("Could not copy '#{nodedht_dir}' to '#{cloud7_peers}'")
    end

    msg("Successfully installed node-dht into #{cloud7_peers}")
  end

end # Namespace :nodedht


namespace :carrier do

  task :build => [ :init ] do
    msg "Fetching carrier"

    doSystem('env GIT_SSL_NO_VERIFY=true git clone https://github.com/pgte/carrier.git carrier') unless
      File.directory?('carrier')

    Dir.chdir( '..' )
  end

  # this just initializes the submodule
  task :install => [:init, "carrier:build" ] do
    notice "Install node-carrier"

    carrier_dir = "#{$root_dir}/core/deps/carrier"

    notice "Removing old carrier installation from Cloud7 directory"
    FileUtils.rm_rf carrier_dir or
      error("Could not delete '#{carrier_dir}'")


    carrier_temp_dir = "#{$temp_dir}/carrier"

    begin
      FileUtils.cp_r(carrier_temp_dir, carrier_dir)
    rescue Exception => e
      error("Could not copy '#{carrier_temp_dir}' to '#{carrier_dir}'")
    end

    msg("Successfully installed carrier into #{carrier_dir}")
  end



  task :clean do
    carrier_dir = "#{$temp_dir}/carrier"

    if Dir.exists?(carrier_dir)
      FileUtils.rm_rf carrier_dir or
        error("Could not delete #{carrier_dir}")
    else
      notice "carrier directory does not exist yet (#{carrier_dir})"
    end

    msg("Successfully cleaned the carrier target")
  end

end # Namespace: :carrier



task :all => [ :init, "node:build", "libcage:build", "nodedht:build", "carrier:build" ] do
  msg "All stuff built"
end

task :clean => [ "node:clean", "libcage:clean", "nodedht:clean", "carrier:clean" ] do
  msg "Cleaned all targets"
end

task :install => [ :init, "node:install", "libcage:install", "nodedht:install", "carrier:install"] do
  msg "All installed"
end

