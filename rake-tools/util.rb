module Util

  def getNodeDir()
    Dir.glob("#{$temp_dir}/node-v*/").last
  end

  def getLibEvDir()
    Dir.glob("#{$root_dir}/core/lib/peers/libev").last
  end

  def isCygwin?
    not (%x[uname] =~ /CYGWIN/i).nil?
  end

  def isValidArchive(path)
    `tar -tvzf #{path} 2>&1 >/dev/null`
    valid = $?.success?
    if not valid
      notice "Deleting broken archive '#{path}'"
      doSystem("rm -f #{path}")
    end
    valid
  end

  def doSystem(cmd)
    notice "Executing '#{cmd}'"
    if verboseMode?
      return true if system("#{cmd} 2>&1")
    else
      %x[#{cmd} 2>&1]
      return true if $?.success?
    end
    error "Error executing '#{cmd}'"
  end

  def verboseMode?
    ENV.include?('verbose')
  end

  def msg(msg)
    _puts(msg, :color => :green)
  end

  def notice(msg)
    _puts(msg, :color => :yellow)
  end

  def error(msg)
    _puts(msg, :color => :red)
    exit(-1)
  end

  def requirement(val, type)
    case type
      when :binary
        require_binary(val)
      when :library
        require_library(val)
      end
  end

  def applyPatch(target, patchFile)
     _print "Trying to apply patch to '#{target}': ", :color => :yellow
    ret = %x[patch --ignore-whitespace -F3 -sN #{target}  < #{patchFile} 2>&1]
    if not ret =~ /failed|malformed/i
      _puts("success", :color => :green, :noWrap => true)
    else
      _puts("failed", :color => :red, :noWrap => true)
      error "Failed to apply patch"
    end
  end

private

  def require_binary(tool)
     _print "Checking for program '#{tool}': ", :color => :white
      if (%x[which #{tool}]).strip.empty?
        _puts("no", :color => :red, :noWrap => true)
        error "Missing requirement"
      else
        _puts("yes", :color => :green, :noWrap => true)
      end
  end

  def require_library(lib)
    _print "Checking for library '#{lib}': ", :color => :white
    if %x[gcc -l#{lib} 2>&1] =~ /library not found/
      _puts("no", :color => :red, :noWrap => true)
      error "Missing requirement"
    else
      _puts("yes", :color => :green, :noWrap => true)
    end
  end

  def _puts(msg, options)
    _print(msg, options)
    puts ""
  end

  def _print(msg, options)
    msg = "--- #{msg}" unless options[:noWrap]
    print msg.color(options[:color])
  end

end
