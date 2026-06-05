{
  # Node is used to add locally test and depencies to functions
  languages.javascript = {
    enable = true;
    lsp.enable = false;
    nodejs.enable = true;
    npm.enable = true;
  };

  tasks."couchdb:install" = {
    exec = /* sh */ ''
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
    '';
  };

  tasks."couchdb:setup-secrets" = {
    after = [ "couchdb:install" ];
    exec = /* sh */ ''
      kubectl get secret couchdb-couchdb -o go-template='{{ .data.adminUsername }}' \
        | base64 --decode \
        | faas-cli secret create couchdb-user
      kubectl get secret couchdb-couchdb -o go-template='{{ .data.adminPassword }}' \
        | base64 --decode \
        | faas-cli secret create couchdb-password
    '';
  };
}
