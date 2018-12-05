import { remove, pull, get } from 'lodash';
import {
  TEMPLATE_TYPE_BASE,
  TEMPLATE_TYPE_LABEL,
  TEMPLATE_TYPE_VM,
  PROVISION_SOURCE_PXE,
  PROVISION_SOURCE_REGISTRY,
  PROVISION_SOURCE_URL,
} from '../constants';
import { getDisks, getVolumes, getDataVolumes, getInterfaces, getNetworks } from './selectors';
import { selectVm } from '../k8s/selectors';
import { baseTemplates } from '../k8s/mock_templates';

export const getTemplatesWithLabels = (templates, labels) => {
  const filteredTemplates = [...templates];
  labels.forEach(label => {
    if (label !== undefined) {
      pull(
        filteredTemplates,
        remove(
          filteredTemplates,
          template => Object.keys(template.metadata.labels).find(l => l === label) === undefined
        )
      );
    }
  });
  return filteredTemplates;
};

export const getTemplatesLabelValues = (templates, label) => {
  const labelValues = [];
  templates.forEach(t => {
    const labels = Object.keys(t.metadata.labels || []).filter(l => l.startsWith(label));
    labels.forEach(l => {
      const labelParts = l.split('/');
      if (labelParts.length > 1) {
        const labelName = labelParts[labelParts.length - 1];
        if (labelValues.indexOf(labelName) === -1) {
          labelValues.push(labelName);
        }
      }
    });
  });
  return labelValues;
};

export const getTemplate = (templates, type) => {
  const filteredTemplates = templates.filter(template => {
    const labels = get(template, 'metadata.labels', {});
    return labels[TEMPLATE_TYPE_LABEL] === type;
  });
  return type === TEMPLATE_TYPE_BASE && filteredTemplates.length === 0 ? baseTemplates : filteredTemplates;
};

export const getUserTemplate = (templates, userTemplateName) => {
  const userTemplates = getTemplate(templates, TEMPLATE_TYPE_VM);
  return userTemplates.find(template => template.metadata.name === userTemplateName);
};

export const getTemplateStorages = ({ objects }) => {
  const vm = selectVm(objects);

  const volumes = getVolumes(vm);
  const dataVolumes = getDataVolumes(vm);
  return getDisks(vm).map(disk => {
    const volume = volumes.find(v => v.name === disk.volumeName);
    const storage = {
      disk,
      volume,
    };
    if (get(volume, 'dataVolume')) {
      storage.dataVolume = dataVolumes.find(d => get(d, 'metadata.name') === get(volume.dataVolume, 'name'));
    }
    return storage;
  });
};

export const getTemplateInterfaces = ({ objects }) => {
  const vm = selectVm(objects);

  return getInterfaces(vm).map(i => {
    const network = getNetworks(vm).find(n => n.name === i.name);
    return {
      network,
      interface: i,
    };
  });
};

export const hasAutoAttachPodInterface = ({ objects }) => {
  const vm = selectVm(objects);

  return get(vm, 'spec.template.spec.domain.devices.autoattachPodInterface', true);
};

export const getTemplateProvisionSource = ({ objects }) => {
  const vm = selectVm(objects);
  if (getInterfaces(vm).some(i => i.bootOrder === 1)) {
    return {
      type: PROVISION_SOURCE_PXE,
    };
  }
  const bootDisk = getDisks(vm).find(disk => disk.bootOrder === 1);
  if (bootDisk) {
    const bootVolume = getVolumes(vm).find(volume => volume.name === bootDisk.volumeName);
    if (bootVolume && bootVolume.registryDisk) {
      return {
        type: PROVISION_SOURCE_REGISTRY,
        source: bootVolume.registryDisk.image,
      };
    }
    if (bootVolume && bootVolume.dataVolume) {
      const dataVolume = getDataVolumes(vm).find(dv => dv.metadata.name === bootVolume.dataVolume.name);
      if (dataVolume) {
        return {
          type: PROVISION_SOURCE_URL,
          source: get(dataVolume, 'spec.source.http.url'),
        };
      }
    }
  }
  return null;
};
