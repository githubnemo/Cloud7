

var PeersEvents = {

	joinedNetwork: function(name) {
		console.log("We joined a network.");
	}

};

// Events for the Peers module are routed to PeersEvents.
registerEventHandler("Peers", PeersEvents);

// Tell the core that we want to get notified on Peers.joinedNetwork.
bindToEvent("Peers.joinedNetwork")



