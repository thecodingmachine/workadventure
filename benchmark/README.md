# Load testing

Load testing is performed with Artillery.

Install:

```bash
cd benchmark
yarn install
```

Running the tests (on one core):

```bash
cd benchmark
yarn run start
```

You can adapt the `socketio-load-test.yaml` file to increase/decrease load.

Default settings are:

```yaml
  phases:
    - duration: 20
      arrivalRate: 2
```

which means: during 20 seconds, 2 users will be added every second (peaking at 40 simultaneous users).

Important: don't go above 40 simultaneous users for Artillery, otherwise, it is Artillery that will fail to run the tests properly.
To know, simply run "top". The "node" process for Artillery should never reach 100%.

Reports are generated in `artillery_output.html`.

# Multicore tests

You will want to test with Artillery running on multiple cores.

You can use

```bash
./artillery_multi_core.sh
```

This will trigger 4 Artillery instances in parallel.

Beware, the report generated is generated for only one instance.

# How to test, what to track?

While testing, you can check:

- CPU load of WorkAdventure API node process (it should not reach 100%)
- Get metrics at the end of the run: `http://api.workadventure.localhost/metrics`  
  In particular, look for:
  ```
  # HELP nodejs_eventloop_lag_max_seconds The maximum recorded event loop delay.
  # TYPE nodejs_eventloop_lag_max_seconds gauge
  nodejs_eventloop_lag_max_seconds 23.991418879
  ```
  This is the maximum time it took Node to process an event (you need to restart node after each test to reset this counter)
- Generate a profiling using "node --prof" by switching the command in docker-compose.yaml:
  ```
      #command: yarn dev
      command: yarn run profile
  ```
  Read https://nodejs.org/en/docs/guides/simple-profiling/ on how to generate a profile.

