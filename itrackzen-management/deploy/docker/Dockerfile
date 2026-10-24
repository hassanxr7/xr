# UNTESTED: the build tools were not available while this was prepared. Use deploy/install-ubuntu.sh unless you are ready to test this.
FROM python:3.12-slim-bookworm
ARG ODOO_SHA=98e48692891fc9a3aaa7f53001305b322f53cfa2
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates gcc g++ make libpq-dev libxml2-dev libxslt1-dev libldap2-dev libsasl2-dev libjpeg-dev zlib1g-dev libffi-dev libssl-dev \
      fontconfig libxrender1 libxext6 xfonts-75dpi xfonts-base fonts-liberation fonts-dejavu-core node-less postgresql-client \
    && curl -fsSL -o /tmp/wk.deb https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.bookworm_amd64.deb \
    && apt-get install -y /tmp/wk.deb && rm /tmp/wk.deb \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --create-home --home-dir /opt/itrackzen itrackzen
WORKDIR /opt/itrackzen
RUN git init odoo && cd odoo && git remote add origin https://github.com/odoo/odoo.git \
    && git fetch --depth 1 origin ${ODOO_SHA} && git checkout -q FETCH_HEAD
RUN pip install --no-cache-dir -r odoo/requirements.txt xlsxwriter
COPY addons /opt/itrackzen/addons
COPY deploy/docker/odoo.conf /etc/odoo.conf
RUN mkdir -p /var/lib/odoo && chown -R itrackzen /var/lib/odoo /opt/itrackzen
USER itrackzen
EXPOSE 8069 8072
CMD ["python", "/opt/itrackzen/odoo/odoo-bin", "-c", "/etc/odoo.conf"]
