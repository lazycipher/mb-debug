import { memo, useEffect, useMemo, useState } from 'react';
import { List } from 'react-window';
import type { RowComponentProps } from 'react-window';
import io, { Socket } from 'socket.io-client';

interface PatientVitals {
    id: string;
    heartRate: number;
    bloodPressureSystolic: number;
    bloodPressureDiastolic: number;
    oxygenSaturation: number;
    respiratoryRate: number;
    temperature: number;
    timestamp: number;
}

const HISTORY_LENGTH = 20;
const ITEM_SIZE = 360;

const arePatientsEqual = (a: PatientVitals, b: PatientVitals) =>
    a.heartRate === b.heartRate &&
    a.bloodPressureSystolic === b.bloodPressureSystolic &&
    a.bloodPressureDiastolic === b.bloodPressureDiastolic &&
    a.oxygenSaturation === b.oxygenSaturation &&
    a.respiratoryRate === b.respiratoryRate &&
    a.temperature === b.temperature &&
    a.timestamp === b.timestamp;

const buildSeedHistory = (patient: PatientVitals): number[] => {
    const base = patient.heartRate || 70;
    const offset = patient.id.length % 7;

    return Array.from({ length: HISTORY_LENGTH }, (_, i) => {
        const wave = Math.sin((i + offset) * 0.6) * 3;
        return Math.max(30, Math.round(base + wave));
    });
};

const appendHistory = (
    history: number[] | undefined,
    nextValue: number,
    patient: PatientVitals
): number[] => {
    const base = history ?? buildSeedHistory(patient);
    if (base[base.length - 1] === nextValue) return base;
    const sliced = base.slice(-(HISTORY_LENGTH - 1));
    return [...sliced, nextValue];
};

const getVitalStatus = (vital: string, value: number): string => {
    switch (vital) {
        case 'heartRate':
            if (value < 60 || value > 100) return 'text-red-600';
            return 'text-gray-800';
        case 'oxygenSaturation':
            if (value < 95) return 'text-red-600';
            return 'text-gray-800';
        case 'bloodPressure': {
            const systolic = value;
            if (systolic < 90 || systolic > 140) return 'text-red-600';
            return 'text-gray-800';
        }
        case 'temperature':
            if (value < 36.5 || value > 37.5) return 'text-yellow-600';
            if (value > 38) return 'text-red-600';
            return 'text-gray-800';
        default:
            return 'text-gray-800';
    }
};

type VitalStatusFn = (vital: string, value: number) => string;

type PatientRowProps = {
    patients: PatientVitals[];
    historyMap: Record<string, number[]>;
    getVitalStatus: VitalStatusFn;
};

// Dashboard component for monitoring patient vitals
export const Dashboard = () => {
    const [patients, setPatients] = useState<PatientVitals[]>([]);
    const [historyMap, setHistoryMap] = useState<Record<string, number[]>>({});
    const [isConnected, setIsConnected] = useState(false);
    const [viewportHeight, setViewportHeight] = useState(720);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const updateHeight = () => {
            setViewportHeight(Math.max(360, window.innerHeight - 160));
        };

        updateHeight();
        window.addEventListener('resize', updateHeight);

        return () => {
            window.removeEventListener('resize', updateHeight);
        };
    }, []);

    useEffect(() => {
        // Connect to WebSocket server
        const socket: Socket = io('http://localhost:3000');

        socket.on('connect', () => {
            console.log('Connected to WebSocket server');
            setIsConnected(true);
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from WebSocket server');
            setIsConnected(false);
        });

        const pushHistoryBatch = (updates: PatientVitals[]) => {
            if (!updates.length) return;

            setHistoryMap(prev => {
                let changed = false;
                const next = { ...prev };

                updates.forEach(update => {
                    const current = prev[update.id];
                    const updatedHistory = appendHistory(current, update.heartRate, update);
                    if (current !== updatedHistory) {
                        next[update.id] = updatedHistory;
                        changed = true;
                    }
                });

                return changed ? next : prev;
            });
        };

        const applyUpdates = (updates: PatientVitals[]) => {
            if (!updates.length) return;

            setPatients(prevPatients => {
                const updateMap = new Map(updates.map(update => [update.id, update]));
                const nextPatients: PatientVitals[] = [];
                let changed = false;

                prevPatients.forEach(patient => {
                    const updated = updateMap.get(patient.id);
                    if (updated) {
                        updateMap.delete(patient.id);
                        if (!arePatientsEqual(patient, updated)) {
                            nextPatients.push(updated);
                            changed = true;
                        } else {
                            nextPatients.push(patient);
                        }
                    } else {
                        nextPatients.push(patient);
                    }
                });

                updateMap.forEach(newPatient => {
                    nextPatients.push(newPatient);
                    changed = true;
                });

                return changed ? nextPatients : prevPatients;
            });

            pushHistoryBatch(updates);
        };

        // Receive initial patient data
        socket.on('initial_patients', (initialPatients: PatientVitals[]) => {
            console.log('Received initial patients:', initialPatients.length);
            setPatients(initialPatients);
            pushHistoryBatch(initialPatients);
        });

        // Receive vitals updates
        socket.on('vitals_update', applyUpdates);

        return () => {
            socket.disconnect();
        };
    }, []);

    const listHeight = Math.max(320, viewportHeight - 120);
    const rowProps = useMemo<PatientRowProps>(
        () => ({
            patients,
            historyMap,
            getVitalStatus
        }),
        [patients, historyMap]
    );

    return (
        <div className="bg-gray-100 p-6 min-h-screen">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-gray-100 z-10 py-2">
                <h2 className="text-2xl font-bold text-gray-800">ICU Live Monitor ({patients.length} Patients)</h2>
                <div className={`px-4 py-2 rounded-full text-sm font-bold shadow-sm ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {isConnected ? 'SYSTEM ONLINE' : 'DISCONNECTED'}
                </div>
            </div>

            {patients.length === 0 ? (
                <div className="text-center text-gray-500">Waiting for patient data...</div>
            ) : (
                <List
                    defaultHeight={listHeight}
                    rowCount={patients.length}
                    rowHeight={ITEM_SIZE}
                    overscanCount={4}
                    style={{ height: listHeight, width: '100%' }}
                    rowComponent={PatientRow}
                    rowProps={rowProps}
                />
            )}
        </div>
    );
};

const PatientSparkline = memo(
    ({ history }: { history: number[] }) => {
        if (!history.length) return null;

        const min = Math.min(...history);
        const max = Math.max(...history);
        const range = Math.max(max - min, 1);

        return (
            <div className="mt-4 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-400 mb-1">Vital History (Last 10m)</div>
                <div className="h-12 flex items-end space-x-1">
                    {history.map((value, i) => {
                        const normalized = (value - min) / range;
                        const height = 30 + normalized * 70;
                        const opacity = Math.min(0.5 + (i / (history.length * 2.2)), 1);

                        return (
                            <div
                                key={i}
                                className="w-full bg-blue-100 rounded-t"
                                style={{
                                    height: `${height}%`,
                                    opacity
                                }}
                            />
                        );
                    })}
                </div>
            </div>
        );
    },
    (prev, next) => prev.history === next.history
);

const PatientCard = memo(
    ({ patient, history, getVitalStatus }: { patient: PatientVitals; history: number[]; getVitalStatus: VitalStatusFn }) => {
        const isCritical = patient.oxygenSaturation < 95 || patient.heartRate > 100 || patient.heartRate < 60;

        return (
            <div className="px-1">
                <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500">
                    <div className="flex justify-between items-start mb-3">
                        <h3 className="text-lg font-bold text-gray-900">{patient.id}</h3>
                        <span className="text-xs text-gray-500">
                            {new Date(patient.timestamp).toLocaleTimeString()}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {/* Heart Rate */}
                        <div className="bg-gray-50 p-3 rounded">
                            <div className="text-xs text-gray-500 uppercase mb-1">Heart Rate</div>
                            <div className={`text-xl font-mono font-bold ${getVitalStatus('heartRate', patient.heartRate)}`}>
                                {patient.heartRate}
                                <span className="text-xs font-normal text-gray-400 ml-1">bpm</span>
                            </div>
                        </div>

                        {/* Blood Pressure */}
                        <div className="bg-gray-50 p-3 rounded">
                            <div className="text-xs text-gray-500 uppercase mb-1">Blood Pressure</div>
                            <div className={`text-xl font-mono font-bold ${getVitalStatus('bloodPressure', patient.bloodPressureSystolic)}`}>
                                {patient.bloodPressureSystolic}/{patient.bloodPressureDiastolic}
                                <span className="text-xs font-normal text-gray-400 ml-1">mmHg</span>
                            </div>
                        </div>

                        {/* Oxygen Saturation */}
                        <div className="bg-gray-50 p-3 rounded">
                            <div className="text-xs text-gray-500 uppercase mb-1">SpO₂</div>
                            <div className={`text-xl font-mono font-bold ${getVitalStatus('oxygenSaturation', patient.oxygenSaturation)}`}>
                                {patient.oxygenSaturation}
                                <span className="text-xs font-normal text-gray-400 ml-1">%</span>
                            </div>
                        </div>

                        {/* Respiratory Rate */}
                        <div className="bg-gray-50 p-3 rounded">
                            <div className="text-xs text-gray-500 uppercase mb-1">Resp. Rate</div>
                            <div className="text-xl font-mono font-bold text-gray-800">
                                {patient.respiratoryRate}
                                <span className="text-xs font-normal text-gray-400 ml-1">/min</span>
                            </div>
                        </div>

                        {/* Temperature */}
                        <div className="bg-gray-50 p-3 rounded">
                            <div className="text-xs text-gray-500 uppercase mb-1">Temperature</div>
                            <div className={`text-xl font-mono font-bold ${getVitalStatus('temperature', patient.temperature)}`}>
                                {patient.temperature.toFixed(1)}
                                <span className="text-xs font-normal text-gray-400 ml-1">°C</span>
                            </div>
                        </div>

                        {/* Status Summary */}
                        <div className="bg-gray-50 p-3 rounded flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-xs text-gray-500 uppercase mb-1">Status</div>
                                <div className={`text-sm font-semibold px-3 py-1 rounded-full ${isCritical
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-green-100 text-green-800'
                                    }`}>
                                    {isCritical ? 'CRITICAL' : 'STABLE'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <PatientSparkline history={history} />
                </div>
            </div>
        );
    },
    (prev, next) => prev.patient === next.patient && prev.history === next.history
);

const PatientRow = ({
    index,
    style,
    patients,
    historyMap,
    getVitalStatus
}: RowComponentProps<PatientRowProps>) => {
    const patient = patients[index];
    if (!patient) return <div style={style} />;

    const history = historyMap[patient.id] ?? [];

    return (
        <div style={{ ...style, paddingBottom: 12 }}>
            <PatientCard patient={patient} history={history} getVitalStatus={getVitalStatus} />
        </div>
    );
};
