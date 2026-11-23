/* Dados locais das páginas internas. Os exemplos só são persistidos mediante uma ação de gravação. */
const plantStore = (() => {
  const STORAGE_KEY = 'solaris.plants.v1';
  const examples = [
    {
      id: 'plant-1',
      name: 'Fazenda Sol Nascente',
      type: 'Solo',
      city: 'Uberlândia',
      state: 'MG',
      capacity: 320,
      tilt: 12,
      nominal: 300,
      startDate: '2023-03-15',
      notes: '',
      client: 'Energia Solar Ltda.',
      email: 'contato@energiasolar.example',
      cep: '38400-000',
      street: 'Estrada Solar',
      number: '1200',
      complement: '',
      inverters: [
        { id: 'inv-1', brand: 'Huawei', model: 'SUN2000-100KTL', serial: 'SN-HW-001245', status: 'Online' },
        { id: 'inv-2', brand: 'SMA', model: 'Sunny Tripower', serial: 'SN-SMA-004321', status: 'Online' },
      ],
      alarms: [
        {
          id: 'alarm-1',
          severity: 'Baixa',
          title: 'Comunicação intermitente',
          description: 'Perda momentânea de comunicação com o inversor INV-03.',
          date: 'Hoje, 13:47',
          status: 'Aberto',
        },
      ],
    },
    {
      id: 'plant-2',
      name: 'Sítio Boa Vista',
      type: 'Solo',
      city: 'Montes Claros',
      state: 'MG',
      capacity: 180,
      tilt: 10,
      nominal: 160,
      startDate: '2024-06-01',
      notes: '',
      client: 'João Pereira',
      email: 'joao@example.com',
      cep: '39400-000',
      street: 'Estrada Boa Vista',
      number: '45',
      complement: '',
      inverters: [
        { id: 'inv-3', brand: 'Growatt', model: 'MAX 80KTL3', serial: 'SN-GR-000873', status: 'Atenção' },
      ],
      alarms: [
        {
          id: 'alarm-2',
          severity: 'Média',
          title: 'Temperatura elevada',
          description: 'Temperatura acima do limite configurado.',
          date: 'Hoje, 11:20',
          status: 'Aberto',
        },
      ],
    },
    {
      id: 'plant-3',
      name: 'Usina Horizonte',
      type: 'Solo',
      city: 'Juiz de Fora',
      state: 'MG',
      capacity: 250,
      tilt: 15,
      nominal: 230,
      startDate: '2022-11-10',
      notes: '',
      client: 'Horizonte Geração',
      email: 'operacao@horizonte.example',
      cep: '36000-000',
      street: 'Rodovia MG-353',
      number: '80',
      complement: '',
      inverters: [
        { id: 'inv-4', brand: 'Huawei', model: 'SUN2000-100KTL', serial: 'SN-HW-002019', status: 'Offline' },
      ],
      alarms: [],
    },
  ];

  let snapshot;
  let readable = false;
  let records = [];

  function warn(message) {
    const main = document.querySelector('main');
    let warning = document.getElementById('storage-warning');
    if (!warning) {
      warning = document.createElement('p');
      warning.id = 'storage-warning';
      warning.className = 'storage-warning';
      warning.setAttribute('role', 'alert');
      warning.tabIndex = -1;
      main.prepend(warning);
    }
    warning.textContent = message;
    if (!document.querySelector('dialog[open]')) {
      warning.focus({ preventScroll: true });
      warning.scrollIntoView({ block: 'center' });
    }
  }

  function readRecords(raw) {
    if (raw === null) return structuredClone(examples);
    const list = JSON.parse(raw);
    function checkIds(items) {
      const keys = new Set();
      return (
        Array.isArray(items) &&
        items.every((item) => {
          if (!item || typeof item.id !== 'string' || !item.id || keys.has(item.id)) return false;
          keys.add(item.id);
          return true;
        })
      );
    }
    if (!checkIds(list)) throw new Error();
    return list.map((plant) => {
      const inverters = plant.inverters ?? [];
      const alarms = plant.alarms ?? [];
      if (
        typeof plant.name !== 'string' ||
        !checkIds(inverters) ||
        !checkIds(alarms) ||
        inverters.some((item) => typeof item.serial !== 'string') ||
        !Number.isFinite(Number(plant.capacity ?? 0))
      )
        throw new Error();
      return { ...plant, inverters, alarms };
    });
  }

  try {
    snapshot = localStorage.getItem(STORAGE_KEY);
    records = readRecords(snapshot);
    readable = true;
  } catch {
    warn('Não foi possível ler os cadastros locais. As alterações estão bloqueadas para preservar os dados.');
  }

  async function save(next) {
    if (!readable) return false;
    function write() {
      if (localStorage.getItem(STORAGE_KEY) !== snapshot) {
        warn('Os cadastros mudaram em outra aba. Recarregue esta página antes de salvar.');
        return false;
      }
      const serialized = JSON.stringify(next);
      localStorage.setItem(STORAGE_KEY, serialized);
      return true;
    }
    try {
      return navigator.locks ? await navigator.locks.request(STORAGE_KEY, write) : write();
    } catch {
      warn('Não foi possível salvar. Verifique o espaço e a permissão de armazenamento do navegador.');
      return false;
    }
  }

  function missingExamples() {
    const serials = new Set(
      records.flatMap((plant) => plant.inverters.map((item) => item.serial.trim().toLowerCase())),
    );
    return structuredClone(
      examples.filter(
        (example) =>
          !records.some((plant) => plant.id === example.id) &&
          example.inverters.every((item) => !serials.has(item.serial.toLowerCase())),
      ),
    );
  }

  return {
    get plants() {
      return records;
    },
    get readable() {
      return readable;
    },
    save,
    missingExamples,
  };
})();
