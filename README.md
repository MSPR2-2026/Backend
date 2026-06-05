# Backend

## Requirements

Setup the environment using [our environment repository](https://github.com/MSPR2-2026/OpenFaaS-env/).

## Setup

Install CouchDB in the cluster:
```sh
helm repo add couchdb https://apache.github.io/couchdb-helm
helm install couchdb \
  --version=4.6.3 \
  --set couchdbConfig.couchdb.uuid=$(uuidgen) \
  couchdb/couchdb --wait
kubectl exec --namespace default -it couchdb-couchdb-0 -c couchdb -- \
  curl -s \
  http://127.0.0.1:5984/_cluster_setup \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"action": "finish_cluster"}' \
  -u "$(kubectl get secret couchdb-couchdb -o go-template='{{ .data.adminUsername }}' | base64 --decode):$(kubectl get secret couchdb-couchdb -o go-template='{{ .data.adminPassword }}' | base64 --decode)"
```

Create OpenFaaS secrets to connect to the CouchDB instance:
```sh
kubectl get secret couchdb-couchdb -o go-template='{{ .data.adminUsername }}' \
  | base64 --decode \
  | faas-cli secret create couchdb-user
kubectl get secret couchdb-couchdb -o go-template='{{ .data.adminPassword }}' \
  | base64 --decode \
  | faas-cli secret create couchdb-password
```

## Setup (with devenv)

Install CouchDB and set the necessary OpenFaaS secrets using the provided tasks:
```sh
devenv tasks run "couchdb:setup-secrets"
```
