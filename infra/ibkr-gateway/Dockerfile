FROM openjdk:11-jre-slim
WORKDIR /root/ibkr
# CP Gateway zip is downloaded/extracted here at build time or via volume mount.
# Download from: https://www.interactivebrokers.com/en/trading/ibgateway-stable.php
# Expected layout after extraction:
#   /root/ibkr/root/
#   /root/ibkr/bin/run.sh
COPY conf.yaml root/conf.yaml
# Run CP Gateway headless on port 5000
EXPOSE 5000
CMD ["bin/run.sh", "root/conf.yaml"]
