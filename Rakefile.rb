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
# libev related
####

namespace :libev do

  task :build => [ :init ] do
    msg "Building libev"

	ev_version = "4.04" # version string of needed version

	if not File.directory?('libev')
		doSystem("wget http://dist.schmorp.de/libev/libev-#{ev_version}.tar.gz")
		doSystem("tar -xvzf libev-#{ev_version}.tar.gz")
		doSystem("mv libev-#{ev_version} libev")
	end

    notice "Changing to ./libev/"
    Dir.chdir( './libev/' )

	additional_ldflags = ""

	if not isDarwin?
      additional_ldflags += "-lrt"
	end

	flags = 'CFLAGS="-DHAVE_LIBRT -DEV_FORK_ENABLE=0 -DEV_EMBED_ENABLE=0 -DEV_MULTIPLICITY=0" LDFLAGS="'+additional_ldflags+'"'

	if not File.exists?('./configured')
		doSystem("#{flags} ./configure && :> ./configured")
		doSystem("#{flags} make")
	end

    Dir.chdir('../')
  end


  task :clean do
    libev_dir = "#{$temp_dir}/libev"
    if File.exists?(libev_dir)
      Dir.chdir(libev_dir)
      doSystem("make clean")
      doSystem('rm ./configured') if File.exists?('./configured)')
    else
      notice "libev directory does not exist yet (#{libev_dir})"
    end

    msg("Successfully cleaned the libev target")
  end


  task :install => [:init, "libev:build"] do
    cloud7_peers = "#{$root_dir}/core/lib/peers/"

    notice "Removing old libev installation from Cloud7 directory"
    FileUtils.rm_rf "#{cloud7_peers}/libev" or
      error("Could not delete '#{cloud7_peers}/libev'")


    libev_dir = "#{$temp_dir}/libev"

    begin
      FileUtils.cp_r(libev_dir, cloud7_peers)
    rescue Exception => e
      error("Could not copy '#{libev_dir}' to '#{cloud7_peers}'")
    end

    msg("Successfully installed libev into #{cloud7_peers}")
  end


end # Namespace :libev

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
	  additionals = "" # additional configuration parameters

      if isCygwin?
        additionals = "--openssl-libpath=/usr/lib"
      end

      libev_dir = getLibEvDir

      doSystem("./configure --shared-libev --shared-libev-includes=#{libev_dir} --shared-libev-libpath=#{libev_dir}/.libs #{additionals}")

      doSystem('python tools/waf-light build')
    end

    $node_dir = node_dir

    Dir.chdir('../')
  end


  task :clean do
    node_dir = getNodeDir()

    if File.exists?(node_dir)
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

    node_dir = getNodeDir()
	libev_dir = getLibEvDir()

    doSystem("omake CXXFLAGS='-I#{libev_dir}/' LDFLAGS='-L#{libev_dir}/.libs/' EV=TRUE")

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
	libev_dir = getLibEvDir()

	environment = "export PYTHONPATH=#{node_dir}/tools/wafadmin/:#{node_dir}/tools/wafadmin/Tools ; export PREFIX_NODE=#{node_dir} ;"


	additional_cflags = ""
	additional_linkflags = ""

    if isCygwin?
		additional_linkflags += "-L#{libev_dir}/.libs"
		applyPatch('./wscript', '#{$root_dir}/rake-tools/patches/node-dht_wscript_cygwin.patch');
    end

	cflags = "CXXFLAGS='-I#{libev_dir} -I#{node_dir}/src/ -I#{node_dir}/deps/libeio/ -I#{node_dir}deps/v8/include/ -I#{$root_dir}/_temp/libcage/include/ #{additional_cflags}' "

	linkflags = "LINKFLAGS='-L#{node_dir}/build/default/ -L#{$root_dir}/_temp/libcage/src/ #{additional_linkflags}' "


    doSystem("#{environment} #{cflags} #{linkflags} #{node_dir}/tools/node-waf configure")
    doSystem("#{environment} #{cflags} #{linkflags} #{node_dir}/tools/node-waf build -v")


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



task :all => [ :init, "libev:build", "node:build", "libcage:build", "nodedht:build", "carrier:build" ] do
  msg "All stuff built"
end

task :clean => [ "libev:build", "node:clean", "libcage:clean", "nodedht:clean", "carrier:clean" ] do
  msg "Cleaned all targets"
end

task :install => [ :init, "libev:install", "node:install", "libcage:install", "nodedht:install", "carrier:install"] do
  msg "All installed"
end

