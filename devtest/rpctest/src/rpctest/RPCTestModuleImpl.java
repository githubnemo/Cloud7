package rpctest;

public class RPCTestModuleImpl implements RPCTestModule {

	@Override
	public String echo2(String input) {
		return input+"2";
	}
	
}