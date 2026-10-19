'use strict';

// Selected ioBroker/json-config 8.1.1 methods, MIT; see README.md and LICENSE.

// Commit fd30206954a5c29c6093340b02aaae0993bbf11c. Types stripped at fixture generation.

// This fixture executes upstream form logic; React layout and browser services are injected/omitted.

module.exports = function createAdminContract(environment) {

    const { isObject, I18n, console, setTimeout, clearTimeout, window } = environment;

    class ConfigGeneric {

        componentDidMount() {} // Fixture: base React subscription/registration is not exercised.

    onUpdate = (data                     )       => {
        const value = ConfigGeneric.getValue(data || this.props.data, this.props.attr) || '';
        if (this.state.value !== value) {
            this.setState({ value });
        } else {
            this.forceUpdate();
        }
    };

    static getValue(data                     , attr                   )      {
        if (typeof attr === 'string') {
            return ConfigGeneric.getValue(data, attr.split('.'));
        }
        if (attr.length === 1) {
            return data[attr[0]];
        }
        const part = attr.shift();

        if (typeof part === 'string' && typeof data[part] === 'object') {
            return ConfigGeneric.getValue(data[part], attr);
        }
        return undefined;
    }

    static setValue(data                     , attr                   , value     )       {
        if (typeof attr === 'string') {
            ConfigGeneric.setValue(data, attr.split('.'), value);
            return;
        }
        if (attr.length === 1) {
            if (value === null) {
                delete data[attr[0]];
            } else {
                data[attr[0]] = value;
            }
        } else {
            const part = attr.shift();

            if (typeof part !== 'string') {
                return;
            }

            if (!data[part] || typeof data[part] === 'object') {
                data[part] = data[part] || {};
            }
            ConfigGeneric.setValue(data[part], attr, value);
        }
    }

    getText(text                             , noTranslation          )         {
        if (!text) {
            return '';
        }

        if (typeof text === 'string') {
            const strText = noTranslation ? text : I18n.t(text);
            if (strText.includes('${')) {
                return this.getPattern(strText, null, noTranslation);
            }
            return strText;
        }

        if (isObject(text)) {
            // todo
            if ((text       ).func) {
                // calculate pattern
                if (typeof (text       ).func === 'object') {
                    return this.getPattern((text       ).func[this.lang] || (text       ).func.en || '', null, true);
                }
                return this.getPattern((text       ).func, null, noTranslation);
            }

            return text[this.lang] || text.en || '';
        }

        return (text       ).toString();
    }

    onChangeAsync(attr        , newValue         )                {
        return new Promise(resolve => {
            const mayBePromise = this.onChange(attr, newValue, resolve);
            if (mayBePromise instanceof Promise) {
                mayBePromise.catch(e => console.error(`Cannot set value: ${e}`));
            }
        });
    }

    /**
     * Trigger onChange, to activate save button on change
     *
     * @param attr the changed attribute
     * @param newValue new value of the attribute
     * @param cb optional callback function, else returns a Promise
     */
    onChange(attr        , newValue         , cb             )                {
        // Do not use here deep copy, as it is not JsonConfig
        const data = JSON.parse(JSON.stringify(this.props.data));
        ConfigGeneric.setValue(data, attr, newValue);

        if (
            this.props.schema.confirm &&
            this.execute(this.props.schema.confirm.condition, false, data, this.props.arrayIndex, this.props.globalData)
        ) {
            return new Promise      (resolve => {
                this.setState(
                    {
                        confirmDialog: true,
                        confirmNewValue: newValue,
                        confirmAttr: attr,
                        confirmData: null,
                    },
                    () => {
                        if (typeof cb === 'function') {
                            cb();
                        } else {
                            resolve();
                        }
                    },
                );
            });
        }
        // find any inputs with confirmation
        if (this.props.schema.confirmDependsOn) {
            for (let z = 0; z < this.props.schema.confirmDependsOn.length; z++) {
                const dep = this.props.schema.confirmDependsOn[z];
                if (dep.confirm) {
                    const val = ConfigGeneric.getValue(data, dep.attr);

                    if (
                        this.execute(dep.confirm.condition, false, data, this.props.arrayIndex, this.props.globalData)
                    ) {
                        return new Promise      (resolve => {
                            this.setState(
                                {
                                    confirmDialog: true,
                                    confirmNewValue: newValue,
                                    confirmAttr: attr,
                                    confirmDepNewValue: val,
                                    confirmDepAttr: dep.attr,
                                    confirmData: dep.confirm,
                                },
                                () => {
                                    if (typeof cb === 'function') {
                                        cb();
                                    } else {
                                        resolve();
                                    }
                                },
                            );
                        });
                    }
                }
            }
        }

        const changed           = [];
        if (this.props.schema.onChangeDependsOn) {
            for (let z = 0; z < this.props.schema.onChangeDependsOn.length; z++) {
                const dep = this.props.schema.onChangeDependsOn[z];
                if (dep.onChange) {
                    const val = ConfigGeneric.getValue(data, dep.attr);

                    let _newValue;
                    if (this.props.custom) {
                        _newValue = this.executeCustom(
                            dep.onChange.calculateFunc,
                            data,
                            this.props.customObj,
                            this.props.oContext.instanceObj,
                            this.props.arrayIndex,
                            this.props.globalData,
                        );
                    } else {
                        _newValue = this.execute(
                            dep.onChange.calculateFunc,
                            val,
                            data,
                            this.props.arrayIndex,
                            this.props.globalData,
                        );
                    }

                    if (_newValue !== val) {
                        ConfigGeneric.setValue(data, dep.attr, _newValue);
                        changed.push(dep.attr);
                    }
                }
            }
        }

        if (this.props.schema.hiddenDependsOn) {
            for (let z = 0; z < this.props.schema.hiddenDependsOn.length; z++) {
                const dep = this.props.schema.hiddenDependsOn[z];
                if (dep.hidden) {
                    changed.push(dep.attr);
                }
            }
        }

        if (this.props.schema.labelDependsOn) {
            for (let z = 0; z < this.props.schema.labelDependsOn.length; z++) {
                const dep = this.props.schema.labelDependsOn[z];
                if (dep.hidden) {
                    changed.push(dep.attr);
                }
            }
        }

        if (this.props.schema.helpDependsOn) {
            for (let z = 0; z < this.props.schema.helpDependsOn.length; z++) {
                const dep = this.props.schema.helpDependsOn[z];
                if (dep.hidden) {
                    changed.push(dep.attr);
                }
            }
        }

        if (this.props.schema.onChange && !this.props.schema.onChange.ignoreOwnChanges) {
            const val = ConfigGeneric.getValue(data, this.props.attr);

            const newValue_ = this.props.custom
                ? this.executeCustom(
                      this.props.schema.onChange.calculateFunc,
                      data,
                      this.props.customObj,
                      this.props.oContext.instanceObj,
                      this.props.arrayIndex,
                      this.props.globalData,
                  )
                : this.execute(
                      this.props.schema.onChange.calculateFunc,
                      val,
                      data,
                      this.props.arrayIndex,
                      this.props.globalData,
                  );
            if (newValue_ !== val) {
                ConfigGeneric.setValue(data, this.props.attr, newValue_);
            }
        }

        if (this.props.custom) {
            this.props.onChange(attr, newValue, () => cb && cb());

            if (changed?.length) {
                changed.forEach((_attr, i) =>
                    setTimeout(() => this.props.onChange(_attr, ConfigGeneric.getValue(data, _attr)), i * 50),
                );
            }
        } else {
            this.props.onChange(data, undefined, () => {
                if (changed.length) {
                    this.props.oContext.forceUpdate(changed, data);
                }
                if (cb) {
                    cb();
                }
            });
        }

        return Promise.resolve();
    }

    execute(
        func                                           ,
        defaultValue                           ,
        data                     ,
        arrayIndex        ,
        globalData                     ,
    )                            {
        let fun        ;

        if (isObject(func)) {
            fun = func.func;
        } else if (typeof func === 'string') {
            fun = func;
        } else {
            return func;
        }

        if (!fun) {
            return defaultValue;
        }
        try {
            const f = new Function(
                'data',
                'originalData',
                '_system',
                '_alive',
                '_common',
                '_socket',
                '_instance',
                'arrayIndex',
                'globalData',
                '_changed',
                fun.includes('return') ? fun : `return ${fun}`,
            );
            return f(
                data || this.props.data,
                this.props.originalData,
                this.props.oContext.systemConfig,
                this.props.alive,
                this.props.common,
                this.props.oContext.socket,
                this.props.oContext.instance,
                arrayIndex,
                globalData,
                this.props.changed,
            );
        } catch (e) {
            console.error(`Cannot execute ${JSON.stringify(func)}: ${e}`);
            return defaultValue;
        }
    }

    executeCustom(
        func                                           ,
        data                     ,
        customObj                     ,
        instanceObj                         ,
        arrayIndex        ,
        globalData                     ,
    )                                   {
        let fun        ;

        if (isObject(func)) {
            fun = func.func;
        } else if (typeof func === 'string') {
            fun = func;
        } else {
            return func;
        }

        if (!fun) {
            return null;
        }
        try {
            const f = new Function(
                'data',
                'originalData',
                '_system',
                'instanceObj',
                'customObj',
                '_socket',
                'arrayIndex',
                'globalData',
                '_changed',
                fun.includes('return') ? fun : `return ${fun}`,
            );
            return f(
                data || this.props.data,
                this.props.originalData,
                this.props.oContext.systemConfig,
                instanceObj,
                customObj,
                this.props.oContext.socket,
                arrayIndex,
                globalData,
                this.props.changed,
            );
        } catch (e) {
            console.error(`Cannot execute ${fun}: ${e}`);
            return null;
        }
    }

    calculate(schema                     )




      {
        let error         ;
        let disabled         ;
        let hidden         ;
        let defaultValue                                  ;

        if (this.props.custom) {
            error = schema.validator
                ? !this.executeCustom(
                      schema.validator,
                      this.props.data,
                      this.props.customObj,
                      this.props.oContext.instanceObj,
                      this.props.arrayIndex,
                      this.props.globalData,
                  )
                : false;
            if (schema.disabled === true) {
                disabled = true;
            } else {
                disabled = schema.disabled
                    ? (this.executeCustom(
                          schema.disabled,
                          this.props.data,
                          this.props.customObj,
                          this.props.oContext.instanceObj,
                          this.props.arrayIndex,
                          this.props.globalData,
                      )           )
                    : false;
            }
            if (schema.hidden === true) {
                hidden = true;
            } else {
                hidden = schema.hidden
                    ? (this.executeCustom(
                          schema.hidden,
                          this.props.data,
                          this.props.customObj,
                          this.props.oContext.instanceObj,
                          this.props.arrayIndex,
                          this.props.globalData,
                      )           )
                    : false;
            }
            defaultValue = schema.defaultFunc
                ? this.executeCustom(
                      schema.defaultFunc,
                      this.props.data,
                      this.props.customObj,
                      this.props.oContext.instanceObj,
                      this.props.arrayIndex,
                      this.props.globalData,
                  )
                : schema.default;
        } else {
            error = schema.validator
                ? !this.execute(schema.validator, false, this.props.data, this.props.arrayIndex, this.props.globalData)
                : false;
            if (schema.disabled === true) {
                disabled = true;
            } else {
                disabled = schema.disabled
                    ? (this.execute(
                          schema.disabled,
                          false,
                          this.props.data,
                          this.props.arrayIndex,
                          this.props.globalData,
                      )           )
                    : false;
            }
            if (schema.hidden === true) {
                hidden = true;
            } else {
                hidden = schema.hidden
                    ? (this.execute(
                          schema.hidden,
                          false,
                          this.props.data,
                          this.props.arrayIndex,
                          this.props.globalData,
                      )           )
                    : false;
            }
            defaultValue = schema.defaultFunc
                ? this.execute(
                      schema.defaultFunc,
                      schema.default,
                      this.props.data,
                      this.props.arrayIndex,
                      this.props.globalData,
                  )
                : schema.default;
        }

        return {
            error,
            disabled,
            hidden,
            defaultValue,
        };
    }

    static escapeString(str        , data                     )         {
        if (typeof str !== 'string') {
            return '';
        }
        str = str.replace(/`/g, '\\`');
        // extract all tokes with ${data.token}
        str = str.replace(/\${([^}]+)}/g, (_match        , p1     ) => {
            if (p1 && typeof p1 === 'string' && p1.startsWith('data.')) {
                const value = ConfigGeneric.getValue(data, p1.replace(/^data\./, ''));

                if (typeof value === 'string') {
                    // Handle both backslashes and quotes to ensure valid JSON
                    if (value.includes('\\') || value.includes('"')) {
                        return `\${${p1}.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"')}`;
                    }
                }
            }
            return _match;
        });

        return str;
    }

    getPattern(pattern                           , data                      , noTranslation          )         {
        data = data || this.props.data;
        if (!pattern) {
            return '';
        }
        let patternStr        ;
        if (typeof pattern === 'object') {
            if (pattern.func) {
                patternStr = (pattern                    ).func;
            } else {
                console.log(`Object must be stringified: ${JSON.stringify(pattern)}`);
                patternStr = JSON.stringify(pattern);
            }
        } else {
            patternStr = pattern;
        }

        try {
            if (this.props.custom) {
                const f = new Function(
                    'data',
                    'originalData',
                    'arrayIndex',
                    'globalData',
                    '_system',
                    'instanceObj',
                    'customObj',
                    '_socket',
                    '_changed',
                    `return \`${ConfigGeneric.escapeString(patternStr, data)}\``,
                );
                return f(
                    data,
                    this.props.originalData,
                    this.props.arrayIndex,
                    this.props.globalData,
                    this.props.oContext.systemConfig,
                    this.props.oContext.instanceObj,
                    this.props.customObj,
                    this.props.oContext.socket,
                    this.props.changed,
                );
            }

            const f = new Function(
                'data',
                'originalData',
                'arrayIndex',
                'globalData',
                '_system',
                '_alive',
                '_common',
                '_socket',
                '_changed',
                `return \`${ConfigGeneric.escapeString(patternStr, data)}\``,
            );
            const text = f(
                data,
                this.props.originalData,
                this.props.arrayIndex,
                this.props.globalData,
                this.props.oContext.systemConfig,
                this.props.alive,
                this.props.common,
                this.props.oContext.socket,
                this.props.changed,
            );
            if (noTranslation) {
                return text;
            }
            return I18n.t(text);
        } catch (e) {
            console.error(`Cannot execute ${patternStr}: ${e}`);
            return patternStr;
        }
    }

    render()                              {
        const schema = this.props.schema;

        if (!schema) {
            return null;
        }

        // Do not show this component if expert mode is false
        if (this.props.expertMode === false && schema.expertMode) {
            return null;
        }

        if (this.props.alive && this.defaultSendToDone === false) {
            this.sendToTimeout = setTimeout(() => {
                this.sendToTimeout = null;
                this.sendTo();
            }, 200);
        }

        const { error, disabled, hidden, defaultValue } = this.calculate(schema);

        if (hidden) {
            // Remove all errors if an element is hidden
            if (Object.keys(this.isError).length) {
                setTimeout(
                    isError => Object.keys(isError).forEach(attr => this.props.onError(attr)),
                    100,
                    JSON.parse(JSON.stringify(this.isError)),
                );
                this.isError = {};
            }

            // Fixture: hidden spacer JSX is not rendered.
            if (schema.hideOnlyControl) throw new Error("Hidden spacer layout is outside this fixture");

            return null;
        }
        // Add error
        if (schema.validatorNoSaveOnError) {
            if (error && !Object.keys(this.isError).length) {
                this.isError = {
                    [this.props.attr]: schema.validatorErrorText ? I18n.t(schema.validatorErrorText) : true,
                };
                setTimeout(
                    isError => Object.keys(isError).forEach(attr => this.props.onError(attr, isError[attr])),
                    100,
                    JSON.parse(JSON.stringify(this.isError)),
                );
            } else if (!error && Object.keys(this.isError).length) {
                setTimeout(
                    isError => Object.keys(isError).forEach(attr => this.props.onError(attr)),
                    100,
                    JSON.parse(JSON.stringify(this.isError)),
                );
                this.isError = {};
            }
        }

        const renderedItem = this.renderItem(
            error,
            disabled || this.props.commandRunning || this.props.disabled,
            defaultValue,
        );
        return renderedItem; // Fixture: omit visible layout JSX.
    }

    }

    class ConfigSendto extends ConfigGeneric {

    async componentDidMount()                {
        super.componentDidMount();

        let hostname = window.location.hostname;
        if (this.props.schema.openUrl) {
            // read admin host
            const adminInstance = await this.props.oContext.socket.getCurrentInstance();
            const instanceObj = await this.props.oContext.socket.getObject(
                `system.adapter.${adminInstance}`                               ,
            );

            if (instanceObj) {
                const hostObj = await this.props.oContext.socket.getObject(`system.host.${instanceObj?.common?.host}`);
                if (hostObj) {
                    const ip = findNetworkAddressOfHost(hostObj, window.location.hostname);
                    if (ip) {
                        hostname = `${ip}:${window.location.port}`;
                    } else {
                        console.warn(
                            `Cannot find suitable IP in host ${instanceObj.common.host} for ${instanceObj._id}`,
                        );
                        return;
                    }
                }
            }
        }

        await new Promise      (resolve => {
            this.setState({ _error: '', _message: '', hostname }, resolve);
        });

        if (this.props.schema.onLoaded) {
            this._onClick();
        }
    }

    _onClick()       {
        this.props.oContext.onCommandRunning(true);
        this.setState({ running: true });

        const _origin = `${window.location.protocol}//${window.location.host}${window.location.pathname.replace(/\/index\.html$/, '')}`;
        const _originIp = `${window.location.protocol}//${this.state.hostname.split(':').length > 3 ? `[${this.state.hostname}]` : this.state.hostname}${window.location.pathname.replace(/\/index\.html$/, '')}`;

        let data                      = this.props.schema.data;
        if (data === undefined && this.props.schema.jsonData) {
            const dataStr = this.getPattern(
                this.props.schema.jsonData,
                {
                    _origin,
                    _originIp,
                    ...this.props.data,
                },
                true,
            );

            try {
                data = JSON.parse(dataStr);
            } catch {
                console.error(`Cannot parse json data: ${dataStr}`);
            }
        }
        if (data === undefined) {
            data = null;
        }
        if (this.props.schema.openUrl && !data) {
            data = {
                _origin,
                _originIp,
            };
        }
        let timeout                                           ;
        if (this.props.schema.timeout) {
            timeout = setTimeout(
                () => {
                    this.props.oContext.onCommandRunning(false);
                    this.setState({ _error: I18n.t('ra_Request timed out'), running: false });
                },
                parseInt(this.props.schema.timeout                 , 10) || 10000,
            );
        }

        void this.props.oContext.socket
            .sendTo(
                `${this.props.oContext.adapterName}.${this.props.oContext.instance}`,
                this.props.schema.command || 'send',
                data,
            )
            .then(async (response                     ) => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = undefined;
                }
                if (response?.error) {
                    if (this.props.schema.error && this.props.schema.error[response.error]) {
                        let error = this.getText(this.props.schema.error[response.error]);
                        response.args?.forEach((arg        ) => (error = error.replace('%s', arg)));
                        this.setState({ _error: error });
                    } else {
                        this.setState({
                            _error: response.error
                                ? typeof response.error === 'string'
                                    ? I18n.t(response.error)
                                    : JSON.stringify(response.error)
                                : I18n.t('ra_Error'),
                        });
                    }
                } else {
                    if (response?.command) {
                        // If backend requested to refresh the config
                        this.props.oContext.onBackEndCommand?.(response.command);
                        return;
                    }
                    if (response?.reloadBrowser && this.props.schema.reloadBrowser) {
                        window.location.reload();
                    } else if (response?.openUrl && this.props.schema.openUrl) {
                        window.open(response.openUrl, response.window || this.props.schema.window || '_blank');
                    } else if (response?.result && this.props.schema.result?.[response.result]) {
                        let text = this.getText(this.props.schema.result[response.result]);
                        response.args?.forEach((arg        ) => (text = text.replace('%s', arg)));
                        window.alert(text);
                    }

                    if (response?.native && this.props.schema.useNative) {
                        for (const [attr, val] of Object.entries(response.native)) {
                            await this.onChangeAsync(attr, val);
                        }

                        setTimeout(
                            () => this.props.oContext.forceUpdate(Object.keys(response.native), this.props.data),
                            300,
                        );
                    } else if (response?.result) {
                        window.alert(
                            typeof response.result === 'object' ? JSON.stringify(response.result) : response.result,
                        );
                    } else {
                        window.alert(I18n.t('ra_Ok'));
                    }

                    if (response?.saveConfig) {
                        this.props.onChange(null, null, null, true);
                    }
                }
            })
            .catch((e     ) => {
                if (this.props.schema.error && this.props.schema.error[e.toString()]) {
                    this.setState({ _error: this.getText(this.props.schema.error[e.toString()]) });
                } else {
                    this.setState({ _error: I18n.t(e.toString()) || I18n.t('ra_Error') });
                }
            })
            .then(() => {
                this.props.oContext.onCommandRunning(false);
                this.setState({ running: false });
            });
    }

    }

    class ConfigAutocompleteSendTo extends ConfigGeneric {

        initialized = false;

    askInstance()       {
        const value = ConfigGeneric.getValue(this.props.data, this.props.attr);
        const selectOptions = this.props.schema.options
            ? this.props.schema.options.map((item     ) =>
                  typeof item === 'string' ? { label: item, value: item } : JSON.parse(JSON.stringify(item)),
              )
            : [];

        if (this.props.alive) {
            let data = this.props.schema.data;
            if (data === undefined && this.props.schema.jsonData) {
                const dataStr         = this.getPattern(this.props.schema.jsonData, null, true);
                try {
                    if (typeof dataStr === 'string') {
                        data = JSON.parse(dataStr);
                    }
                } catch {
                    console.error(`Cannot parse json data: ${JSON.stringify(data)}`);
                }
            }

            if (data === undefined) {
                data = null;
            }

            // Set loading state during sendTo request
            this.setState({ loading: true });

            void this.props.oContext.socket
                .sendTo(
                    `${this.props.oContext.adapterName}.${this.props.oContext.instance}`,
                    this.props.schema.command || 'send',
                    data,
                )
                .then((list         ) => {
                    if (list && Array.isArray(list)) {
                        list.forEach(item =>
                            selectOptions.push(
                                typeof item === 'string'
                                    ? { label: item, value: item }
                                    : JSON.parse(JSON.stringify(item)),
                            ),
                        );
                    }

                    // if __different
                    if (Array.isArray(value)) {
                        selectOptions.unshift({
                            label: I18n.t(ConfigGeneric.DIFFERENT_LABEL),
                            value: ConfigGeneric.DIFFERENT_VALUE,
                        });
                        this.setState({ value: ConfigGeneric.DIFFERENT_VALUE, selectOptions, loading: false });
                    } else {
                        this.setState({ value, selectOptions, loading: false });
                    }
                })
                .catch(error => {
                    console.error('Error in autocompleteSendTo:', error);
                    // Clear loading state on error
                    this.setState({ loading: false });
                });
        } else if (Array.isArray(value)) {
            // if __different
            selectOptions.unshift({
                label: I18n.t(ConfigGeneric.DIFFERENT_LABEL),
                value: ConfigGeneric.DIFFERENT_VALUE,
            });
            this.setState({ value: ConfigGeneric.DIFFERENT_VALUE, selectOptions });
        } else {
            this.setState({ value, selectOptions });
        }
    }

    getContext()         {
        const localContext                      = {};
        if (Array.isArray(this.props.schema.alsoDependsOn)) {
            this.props.schema.alsoDependsOn.forEach(
                attr => (localContext[attr] = ConfigGeneric.getValue(this.props.data, attr)),
            );
        }
        return JSON.stringify(localContext);
    }

    renderItem(error         , disabled         )                     {
        if (this.props.alive) {
            const localContext = this.getContext();
            if (localContext !== this.localContext || !this.initialized) {
                this.localContext = localContext;
                setTimeout(() => this.askInstance(), this.initialized ? 300 : 50);
                this.initialized = true;
            }
        }

        let item;
        const options                                     = this.state.selectOptions
            ? JSON.parse(JSON.stringify(this.state.selectOptions))
            : [];
        const isIndeterminate = Array.isArray(this.state.value) || this.state.value === ConfigGeneric.DIFFERENT_LABEL;

        if (isIndeterminate) {
            [...this.state.value]
                .filter(val => !options.find((it     ) => it.value === val))
                .forEach(it => options.push({ label: it.toString(), value: it }));

            item = { label: I18n.t(ConfigGeneric.DIFFERENT_LABEL), value: ConfigGeneric.DIFFERENT_VALUE };
            options.unshift(item);
        } else {
            item =
                this.state.value !== null &&
                this.state.value !== undefined &&
                options.find((item     ) => item.value == this.state.value); // let "==" be and not ===

            if (this.state.value !== null && this.state.value !== undefined && !item && this.props.schema.freeSolo) {
                item = { value: this.state.value, label: this.state.value };
                options.push(item);
            }
            item = item || null;
        }
        // Fixture: omit Material UI JSX, but expose the original Autocomplete
        // callbacks when the upstream options branch would render it.
        const rendered = { error, disabled, options, item };
        if (!options.length) return rendered;
        return {
            ...rendered,
            onInputChange: e => {
                    if (!e || !this.props.schema.freeSolo) {
                        return;
                    }

                    const val = e.target.value;
                    if (val !== this.state.value) {
                        this.setState({ value: val }, () => this.onChange(this.props.attr, val));
                    }
            },
            onChange: (_, value) => {
                    const val = typeof value === 'object' ? (value ? value.value : '') : value;
                    if (val !== this.state.value) {
                        this.setState({ value: val }, () => this.onChange(this.props.attr, val));
                    }
            },
        };
    }

    }

    class ConfigTable extends ConfigGeneric {

    async componentDidMount()                {
        super.componentDidMount();
        const _value                                              =
            ConfigGeneric.getValue(this.props.data, this.props.attr) || [];
        let value                       ;

        // if the list is given as an object
        if (this.props.schema.objKeyName) {
            value = objectToArray(
                _value                       ,
                this.props.schema.objKeyName,
                this.props.schema.objValueName,
            );
        } else {
            value = _value                         ;
        }

        if (!Array.isArray(value)) {
            value = [];
        }

        if (this.props.schema.encryptedAttributes) {
            const systemConfig = await this.props.oContext.socket.getCompactSystemConfig();
            this.secret = systemConfig?.native.secret || this.secret;

            _value.forEach((el                     ) => {
                this.props.schema.encryptedAttributes.forEach((attr        ) => {
                    if (el[attr]) {
                        el[attr] = decrypt(this.secret, el[attr]);
                    }
                });
            });
        }

        this.setState(
            {
                value,
                visibleValue: null,
                orderBy: /* this.props.schema.items.length ? this.props.schema.items[0].attr : */ '',
                order: 'asc',
                iteration: 0,
                filterOn: [],
                width: 0,
                tableErrors: {},
            },
            () => this.validateUniqueProps(),
        );
    }

        onTableCellChange(idx, attr, valueChange) { // Fixture wrapper for the original JSX onChange callback.

                    const newObj                        = JSON.parse(JSON.stringify(this.state.value));
                    newObj[idx][attr] = valueChange;
                    this.setState({ value: newObj }, () => {
                        this.validateUniqueProps();
                        this.onChangeWrapper(newObj, true);
                    });

        }

    onChangeWrapper = (newValue                       , updateVisible          )       => {
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
        }

        this.typingTimer = setTimeout(
            (value, _updateVisible) => {
                this.typingTimer = null;

                let mayBePromise                      ;
                if (this.props.schema.encryptedAttributes) {
                    const _value = JSON.parse(JSON.stringify(value));
                    _value.forEach((el                     ) => {
                        this.props.schema.encryptedAttributes.forEach((attr        ) => {
                            if (el[attr]) {
                                el[attr] = encrypt(this.secret, el[attr]);
                            }
                        });
                    });

                    if (this.props.schema.objKeyName) {
                        const objValue = arrayToObject(
                            _value,
                            this.props.schema.objKeyName,
                            this.props.schema.objValueName,
                        );
                        mayBePromise = this.onChange(this.props.attr, objValue);
                    } else {
                        mayBePromise = this.onChange(this.props.attr, _value);
                    }
                } else if (this.props.schema.objKeyName) {
                    const objValue = arrayToObject(
                        JSON.parse(JSON.stringify(value)),
                        this.props.schema.objKeyName,
                        this.props.schema.objValueName,
                    );
                    mayBePromise = this.onChange(this.props.attr, objValue);
                } else {
                    mayBePromise = this.onChange(this.props.attr, value);
                }
                if (mayBePromise instanceof Promise) {
                    mayBePromise.catch(e => console.error(`Cannot save: ${e}`));
                }
                if (_updateVisible) {
                    this.applyFilter(false, value);
                    this.handleRequestSort(this.state.orderBy, true);
                }
            },
            300,
            newValue,
            updateVisible,
        );
    };

    }

    class JsonConfigComponent {

    onError = (attr        , error         )       => {
        this.errorCached = this.errorCached || JSON.parse(JSON.stringify(this.state.errors));
        const errors = this.errorCached;
        if (error) {
            errors[attr] = error;
        } else {
            delete errors[attr];
        }

        if (this.errorTimeout) {
            clearTimeout(this.errorTimeout);
        }
        if (JSON.stringify(errors) !== JSON.stringify(this.state.errors)) {
            this.errorTimeout = setTimeout(
                () =>
                    this.setState({ errors: this.errorCached }, () => {
                        this.errorTimeout = null;
                        this.errorCached = null;
                        this.props.onError(!!Object.keys(this.state.errors).length);
                    }),
                50,
            );
        } else {
            this.errorCached = null;
        }
    };

    flatten(schema                     , _list                      )                      {
        _list = _list || {};
        if (schema.items) {
            Object.keys(schema.items).forEach(attr => {
                _list[attr] = schema.items[attr];
                this.flatten(schema.items[attr], _list);
            });
        }

        return _list;
    }

    buildDependencies(schema                                  )       {
        const attrs = this.flatten(schema                       );
        Object.keys(attrs).forEach(attr => {
            if (attrs[attr].confirm?.alsoDependsOn) {
                attrs[attr].confirm?.alsoDependsOn.forEach((dep        ) => {
                    if (!attrs[dep]) {
                        console.error(`[JsonConfigComponent] Attribute ${dep} does not exist!`);
                        if (dep.startsWith('data.')) {
                            console.warn(
                                `[JsonConfigComponent] please use "${dep.replace(/^data\./, '')}" instead of "${dep}"`,
                            );
                        }
                    } else {
                        attrs[dep].confirmDependsOn = attrs[dep].confirmDependsOn || [];

                        const depObj = { ...attrs[attr], attr };
                        if (depObj.confirm) {
                            depObj.confirm.cancel = 'Undo';
                        }

                        attrs[dep].confirmDependsOn.push(depObj);
                    }
                });
            }

            if (attrs[attr].onChange?.alsoDependsOn) {
                attrs[attr].onChange?.alsoDependsOn.forEach((dep        ) => {
                    if (!attrs[dep]) {
                        console.error(`[JsonConfigComponent] Attribute ${dep} does not exist!`);
                        if (dep.startsWith('data.')) {
                            console.warn(
                                `[JsonConfigComponent] please use "${dep.replace(/^data\./, '')}" instead of "${dep}"`,
                            );
                        }
                    } else {
                        attrs[dep].onChangeDependsOn = attrs[dep].onChangeDependsOn || [];

                        const depObj = { ...attrs[attr], attr };

                        attrs[dep].onChangeDependsOn.push(depObj);
                    }
                });
            }

            if (attrs[attr].hidden?.alsoDependsOn) {
                attrs[attr].hidden?.alsoDependsOn.forEach((dep        ) => {
                    if (!attrs[dep]) {
                        console.error(`[JsonConfigComponent] Attribute ${dep} does not exist!`);
                        if (dep.startsWith('data.')) {
                            console.warn(
                                `[JsonConfigComponent] please use "${dep.replace(/^data\./, '')}" instead of "${dep}"`,
                            );
                        }
                    } else {
                        attrs[dep].hiddenDependsOn = attrs[dep].hiddenDependsOn || [];

                        const depObj = { ...attrs[attr], attr };

                        attrs[dep].hiddenDependsOn.push(depObj);
                    }
                });
            }

            if (attrs[attr].label?.alsoDependsOn) {
                attrs[attr].label?.alsoDependsOn.forEach((dep        ) => {
                    if (!attrs[dep]) {
                        console.error(`[JsonConfigComponent] Attribute ${dep} does not exist!`);
                        if (dep.startsWith('data.')) {
                            console.warn(
                                `[JsonConfigComponent] please use "${dep.replace(/^data\./, '')}" instead of "${dep}"`,
                            );
                        }
                    } else {
                        attrs[dep].labelDependsOn = attrs[dep].labelDependsOn || [];

                        const depObj = { ...attrs[attr], attr };

                        attrs[dep].labelDependsOn.push(depObj);
                    }
                });
            }

            if (attrs[attr].help?.alsoDependsOn) {
                attrs[attr].help?.alsoDependsOn.forEach((dep        ) => {
                    if (!attrs[dep]) {
                        console.error(`[JsonConfigComponent] Attribute ${dep} does not exist!`);
                        if (dep.startsWith('data.')) {
                            console.warn(
                                `[JsonConfigComponent] please use "${dep.replace(/^data\./, '')}" instead of "${dep}"`,
                            );
                        }
                    } else {
                        attrs[dep].helpDependsOn = attrs[dep].helpDependsOn || [];

                        const depObj = { ...attrs[attr], attr };

                        attrs[dep].helpDependsOn.push(depObj);
                    }
                });
            }
        });
    }

    }

    class JsonConfig {

    findAttr(attr        , schema                                   )                       {
        schema = schema || this.state.schema;
        if (schema?.items) {
            if (attr in schema.items) {
                return schema.items[attr];
            }
            for (const _item of Object.values(schema.items)) {
                const item = this.findAttr(attr, _item                                    );
                if (item) {
                    return item;
                }
            }
        }

        return null;
    }

        copyNativeForSave(obj) { // Fixture wrapper for the original onSave native-copy loop.

            const doNotSaveAttributes                      = {};

            for (const attr of Object.keys(this.state.data)) {
                const item = this.findAttr(attr);
                if ((!item || !item.doNotSave || item.type === 'state') && !attr.startsWith('_')) {
                    ConfigGeneric.setValue(obj.native, attr, this.state.data[attr]);
                } else {
                    ConfigGeneric.setValue(obj.native, attr, null);
                    doNotSaveAttributes[attr] = this.state.data[attr];
                }
            }

            return { obj, doNotSaveAttributes };

        }

    }

    return { ConfigGeneric, ConfigSendto, ConfigAutocompleteSendTo, ConfigTable, JsonConfigComponent, JsonConfig };

};
