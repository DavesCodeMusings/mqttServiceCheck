# Running with Systemd

```
sudo npm install mqtt
sudo cp service/service_check.service /etc/systemd/system
sudo systemctl daemon-reload
sudo systemctl enable service_check

sudo systemctl start service_check
sudo systemctl status service_check
```
