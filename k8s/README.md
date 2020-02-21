# Kubernetes deployment instructions
Edit `server-config-map.yaml` to specify connect strings for the databases 
you want to register then run the following:
```
kubectl apply -f server-config-map.yaml
kubectl apply -f server-deployment.yaml
kubectl apply -f server-service.yaml
kubectl apply -f client-deployment.yaml
kubectl apply -f client-service.yaml
kubectl apply -f ingress-service.yaml
```