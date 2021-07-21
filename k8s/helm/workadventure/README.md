# Helm Chart to deploy Workadventure

## Prerequisites

### K8S

Get a K8S cluster. For example see https://minikube.sigs.k8s.io/docs/start/

### Helm

Get Helm : https://helm.sh/docs/intro/install/

## Install

1. Clone the repo
2. cd into ./k8s/helm/workadventure

Install workadventure in tag defined in [Chart](./Chart.yaml)
```
helm install myrelease .
```

After a few seconds, you can start rooms by going to http://play.workadventure.minikube/
By default, Workadventure will repond to [play | maps | pusher | uploader | api].workadventure.minikube.

You can also start another universe with another map. For example : http://play.workadventure.minikube/_/anyuniverse/gparant.github.io/tcm-client/Demo/demo-v1.json

### Install workadventure in a specific Git branch (from https://github.com/thecodingmachine/workadventure)
```
helm install myrelease . --set image.tag=develop
```

### Install workadventure with a specific domain
```
helm install myrelease . --set domain=mydomain.com
```

It will then be available at http://play.mydomain.com/_/global/maps.mydomain.com/Floor0/floor0.json


## Customise

You can override any values defined [values.yaml](./values.yaml). Read Helm doc to know how.

## TODO

[ ] TLS in order to make camera and mic working

[ ] How to create private rooms designated by an organization/world/room ?

[ ] Depend from Jitsi Helm to get full self-hosting

[ ] Simplify templates ?