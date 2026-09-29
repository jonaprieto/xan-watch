class XanWatch < Formula
  desc "XAN (Anoma) price and vesting position in the macOS menu bar"
  homepage "https://github.com/jonaprieto/xan-watch"
  url "https://github.com/jonaprieto/xan-watch/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "a9e0c81fa6095ce16a1efe5d0c2ce8c0d26c8c5f7aac34d6f6e56ce86e62b699"
  license "MIT"
  head "https://github.com/jonaprieto/xan-watch.git", branch: "main"

  depends_on "bun"
  depends_on :macos

  def install
    libexec.install "bin", "launchd", "plugin", "src", "package.json", "bun.lock", "tsconfig.json"
    cd libexec do
      system "bun", "install", "--frozen-lockfile", "--production"
    end
    # opt_libexec survives `brew upgrade`, so the login item and plugin never point at a Cellar path
    (bin/"xan-watch").write_env_script libexec/"bin/xan-watch", XAN_WATCH_ROOT: opt_libexec
  end

  def caveats
    <<~EOS
      Set it up once (installs SwiftBar if missing, starts the collector as a login item):
        xan-watch setup
        xan-watch setup --address 0xYourVestingAddress   # also show your vesting position

      Remove the login item and menu plugin with:
        xan-watch uninstall
    EOS
  end

  test do
    assert_match "usage: xan-watch setup", shell_output("#{bin}/xan-watch --help")
    assert_path_exists libexec/"node_modules/viem"
    assert_match "address", shell_output("#{formula_opt_bin("bun")}/bun #{libexec}/src/config.ts --template")
  end
end
