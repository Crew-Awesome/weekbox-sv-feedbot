# weekbox-relay

weekbox-relay checks the X List every five minutes and sends new posts from the configured FNF accounts to Discord. It uses emusks for X access and stores its state on the `relay-state` branch so scheduled runs can continue after skipped jobs.

uhhhh do not use this outside of this repo like forking and such cus its a bit messy and hardcoded for this specifically - malloy